import type { GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway } from './contracts'
import { cents, hexBytes, object, parseWebhook, ProviderError, providerId, providerJson, string, verifyHmac } from './provider-http'

const sessionsPath = '/checkout/checkout_sessions'
const intentPath = '/pa/payment_intents'
const sessionEvents = new Set(['checkout_session.created', 'checkout_session.completed', 'checkout_session.cancelled'])

interface AccessToken {
  value: string
  expiresAt: number
}

const tokens = new WeakMap<PaymentEnv, AccessToken>()

export function airwallexGateway(env: PaymentEnv): PaymentGateway | null {
  const clientId = env.AIRWALLEX_CLIENT_ID
  const key = env.AIRWALLEX_API_KEY
  const account = providerId(env.AIRWALLEX_ACCOUNT_ID)
  const webhookSecret = env.AIRWALLEX_WEBHOOK_SECRET
  if (env.AIRWALLEX_ENABLED !== 'true' || !clientId || !key || !account || !webhookSecret) return null
  const production = env.ENVIRONMENT === 'production'
  const base = production ? 'https://api.airwallex.com/api/v1' : 'https://api.sandbox.airwallex.com/api/v1'
  const checkoutOrigins = production
    ? ['https://checkout.airwallex.com']
    : ['https://checkout.airwallex.com', 'https://checkout.sandbox.airwallex.com', 'https://checkout-demo.airwallex.com']
  async function login(): Promise<AccessToken> {
    const data = object(await providerJson(`${base}/authentication/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': clientId ?? '', 'x-api-key': key ?? '' },
    }))
    const token = string(data?.token)
    const expiry = Date.parse(string(data?.expires_at) ?? '')
    if (!token || !Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new ProviderError(null, 'invalid_airwallex_access_token')
    }
    return { value: token, expiresAt: expiry }
  }

  async function call(path: string, body?: object): Promise<unknown> {
    let access = tokens.get(env)
    if (!access || access.expiresAt <= Date.now() + 60_000) {
      access = await login()
      tokens.set(env, access)
    }
    const headers = {
      Authorization: `Bearer ${access.value}`,
      'Content-Type': 'application/json',
      'x-api-version': '2026-05-29',
    }
    try {
      return await providerJson(`${base}${path}`, body
        ? { method: 'POST', body: JSON.stringify(body), headers }
        : { headers })
    } catch (error) {
      if (error instanceof ProviderError && error.status === 401 && tokens.get(env) === access) tokens.delete(env)
      throw error
    }
  }

  function matches(session: Record<string, unknown>, order: GatewayOrder): boolean {
    return session.account_id === account && session.mode === 'PAYMENT' && session.currency === order.currency
      && object(session.metadata)?.order_reference === order.reference
      && object(session.payment_intent_data)?.merchant_order_id === order.reference
  }

  function checkout(data: unknown, order: GatewayOrder, allowInactive = false): HostedCheckout {
    const session = object(data)
    const id = providerId(session?.id)
    const url = string(session?.url)
    if (!session || !id || !matches(session, order)) throw new ProviderError(null, 'airwallex_session_mismatch')
    if (allowInactive && session.status !== 'ACTIVE' && !url) return { providerId: id, url: '' }
    if (session.status !== 'ACTIVE' || !url || !checkoutOrigins.some((origin) => url.startsWith(`${origin}/`))) {
      throw new ProviderError(null, 'invalid_airwallex_checkout_url')
    }
    return { providerId: id, url }
  }

  return {
    label: 'Airwallex secure checkout',
    async create(order, returnUrl) {
      const address = order.shippingAddress
      const lines = [
        { amount: order.subtotalCents, name: `Crest & Carat order ${order.reference}` },
        { amount: order.shippingCents, name: 'Shipping' },
        { amount: order.taxCents, name: 'Sales tax' },
      ].filter(({ amount }) => amount > 0)
      return checkout(await call(`${sessionsPath}/create`, {
        account_id: account,
        mode: 'PAYMENT',
        ui_mode: 'HOSTED',
        request_id: order.id,
        currency: order.currency,
        success_url: returnUrl,
        back_url: returnUrl,
        metadata: { order_reference: order.reference },
        payment_intent_data: {
          merchant_order_id: order.reference,
          shipping: {
            address: {
              country_code: address.country, city: address.city, postcode: address.postalCode,
              state: address.state, street: [address.line1, address.line2].filter(Boolean).join(', '),
            },
          },
        },
        payment_options: {
          auto_capture: true,
          payment_method_save: { mode: 'DISABLED' },
        },
        line_items: lines.map(({ amount, name }) => ({
          quantity: 1,
          price: {
            currency: order.currency, pricing_model: 'PER_UNIT', unit_amount: amount / 100,
            product: { name },
          },
        })),
      }), order)
    },
    async recover(order) {
      const createdAt = Date.parse(order.checkoutClaimedAt ?? order.createdAt)
      const query = new URLSearchParams({
        account_id: account,
        from_created_at: new Date(createdAt - 300_000).toISOString(),
        to_created_at: new Date(createdAt + 300_000).toISOString(),
        page_size: '50',
      })
      for (let page = 0; page < 4; page++) {
        const response = object(await call(`${sessionsPath}?${query}`))
        if (!Array.isArray(response?.items)) throw new ProviderError(null, 'invalid_airwallex_sessions')
        const candidates = response.items.filter((entry: unknown) =>
          object(object(entry)?.metadata)?.order_reference === order.reference)
        if (candidates.length > 1) throw new ProviderError(null, 'duplicate_airwallex_session')
        if (candidates.length === 1) return checkout(candidates[0], order, true)
        const next = string(response.page_after)
        if (!next || next === query.get('page')) return null
        query.set('page', next)
      }
      return null
    },
    async reconcile(order, id) {
      const session = object(await call(`${sessionsPath}/${id}`))
      if (!session || session.id !== id || !matches(session, order)) {
        return { status: 'payment_review', receivedCents: 0, detail: 'airwallex_session_mismatch' }
      }
      if (session.status === 'EXPIRED' || session.status === 'CANCELLED') {
        return { status: 'payment_review', receivedCents: 0, detail: 'airwallex_session_closed' }
      }
      const paymentId = providerId(session.payment_intent_id)
      if (session.status !== 'COMPLETED' || !paymentId) {
        return { status: 'pending', receivedCents: 0, detail: 'airwallex_checkout_pending' }
      }
      const intent = object(await call(`${intentPath}/${paymentId}`))
      const receivedCents = cents(intent?.captured_amount) ?? 0
      if (!intent || intent.id !== paymentId || intent.merchant_order_id !== order.reference
        || intent.currency !== order.currency || cents(intent.amount) !== order.totalCents
        || receivedCents > order.totalCents) {
        return { status: 'payment_review', receivedCents, detail: 'airwallex_payment_mismatch' }
      }
      if (intent.status === 'SUCCEEDED' && receivedCents === order.totalCents) {
        return { status: 'paid', receivedCents, detail: 'airwallex_payment_confirmed' }
      }
      if (intent.status === 'CANCELLED' || intent.status === 'SUCCEEDED') {
        return { status: 'payment_review', receivedCents, detail: 'airwallex_payment_exception' }
      }
      if (receivedCents > 0 && receivedCents < order.totalCents) {
        return { status: 'partial', receivedCents, detail: 'airwallex_partial_payment' }
      }
      return { status: 'pending', receivedCents, detail: 'airwallex_payment_pending' }
    },
    async authenticate(headers, raw) {
      const timestamp = headers.get('x-timestamp')
      const signature = headers.get('x-signature')
      if (!timestamp || !signature || !/^\d{13}$/.test(timestamp)
        || Math.abs(Date.now() - Number(timestamp)) > 300_000) return false
      if (!await verifyHmac(new TextEncoder().encode(webhookSecret), `${timestamp}${raw}`, [hexBytes(signature)])) {
        return false
      }
      const event = parseWebhook(raw)
      if (!event || event.account_id !== account) return false
      const name = string(event.name)
      const eventKey = providerId(event.id)
      const id = providerId(object(object(event.data)?.object)?.id)
      if (!eventKey || !name || !id) return null
      if (sessionEvents.has(name)) return { eventKey, providerId: id }
      return name === 'payment_intent.succeeded' && id.startsWith('int_') ? { eventKey, transactionId: id } : null
    },
    async resolveReference(id) {
      const resource = id.startsWith('int_') ? intentPath : sessionsPath
      const data = object(await call(`${resource}/${id}`))
      if (data?.id !== id) return null
      if (resource === intentPath) return providerId(data.merchant_order_id)
      return data.account_id === account ? providerId(object(data.metadata)?.order_reference) : null
    },
  }
}
