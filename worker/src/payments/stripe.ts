import type { GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway } from './contracts'
import {
  hexBytes, integer, object, parseWebhook, ProviderError, providerId,
  providerJson, recentTimestamp, string, verifyHmac,
} from './provider-http'

const sessionsPath = '/checkout/sessions'
const checkoutEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
])

export function stripeGateway(env: PaymentEnv): PaymentGateway | null {
  const key = env.STRIPE_SECRET_KEY
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  const production = env.ENVIRONMENT === 'production'
  if (env.STRIPE_ENABLED !== 'true' || !webhookSecret?.startsWith('whsec_') || !key
    || !new RegExp(`^(sk|rk)_${production ? 'live' : 'test'}_`).test(key)) return null

  function call(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${key}`)
    return providerJson(`https://api.stripe.com/v1${path}`, { ...options, headers })
  }

  function checkout(data: unknown, order: GatewayOrder): HostedCheckout {
    const session = object(data)
    const id = providerId(session?.id)
    const url = string(session?.url)
    if (!id?.startsWith('cs_') || !session || !validSession(session, order) || !url
      || !url.startsWith('https://checkout.stripe.com/')) {
      throw new ProviderError(null, 'stripe_checkout_mismatch')
    }
    return { providerId: id, url }
  }

  function validSession(session: Record<string, unknown>, order: GatewayOrder): boolean {
    return session.livemode === production
      && session.mode === 'payment'
      && session.client_reference_id === order.reference
      && object(session.metadata)?.order_reference === order.reference
      && session.currency === 'usd'
      && session.amount_total === order.totalCents
  }

  return {
    label: 'Card or eligible wallet',
    async create(order, returnUrl) {
      const form = new URLSearchParams({
        mode: 'payment',
        client_reference_id: order.reference,
        customer_email: order.email,
        success_url: returnUrl,
        cancel_url: returnUrl,
        'adaptive_pricing[enabled]': 'false',
        'metadata[order_reference]': order.reference,
        'payment_intent_data[metadata][order_reference]': order.reference,
        'payment_method_types[0]': 'card',
      })
      const lines = [
        { amount: order.subtotalCents, name: `Crest & Carat order ${order.reference}` },
        { amount: order.shippingCents, name: 'Shipping' },
        { amount: order.taxCents, name: 'Sales tax' },
      ].filter(({ amount }) => amount > 0)
      lines.forEach(({ amount, name }, index) => {
        const prefix = `line_items[${index}]`
        form.set(`${prefix}[quantity]`, '1')
        form.set(`${prefix}[price_data][currency]`, 'usd')
        form.set(`${prefix}[price_data][unit_amount]`, String(amount))
        form.set(`${prefix}[price_data][product_data][name]`, name)
      })
      const data = await call(sessionsPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `crest-carat-checkout-${order.reference}`,
        },
        body: form,
      })
      return checkout(data, order)
    },
    async recover(order) {
      const query = new URLSearchParams({
        limit: '100',
        'created[gte]': String(Math.floor(Date.parse(order.checkoutClaimedAt ?? order.createdAt) / 1_000) - 300),
      })
      for (let page = 0; page < 5; page++) {
        const list = object(await call(`${sessionsPath}?${query}`))
        const sessions = list?.data
        if (!Array.isArray(sessions)) throw new ProviderError(null, 'invalid_stripe_sessions')
        const matching = sessions.filter((entry: unknown) => object(entry)?.client_reference_id === order.reference)
        if (matching.length > 1) throw new ProviderError(null, 'duplicate_stripe_session')
        if (matching.length === 1) {
          const session = object(matching[0])
          if (session && session.url === null && validSession(session, order)) {
            const id = providerId(session.id)
            if (id?.startsWith('cs_')) {
              // Completed Sessions omit their URL, but can still be recovered and reconciled.
              return { providerId: id, url: '' }
            }
          }
          return checkout(matching[0], order)
        }
        const next = providerId(object(sessions.at(-1))?.id)
        if (list?.has_more !== true || !next) return null
        query.set('starting_after', next)
      }
      return null
    },
    async reconcile(order, id) {
      const session = object(await call(`${sessionsPath}/${id}?expand[]=payment_intent`))
      if (!session || session.id !== id || !validSession(session, order)) {
        return { status: 'payment_review', receivedCents: 0, detail: 'stripe_session_mismatch' }
      }
      if (session.status === 'expired') {
        return { status: 'payment_review', receivedCents: 0, detail: 'stripe_session_expired' }
      }
      const intent = object(session.payment_intent)
      const received = integer(intent?.amount_received) ?? 0
      if (session.payment_status === 'paid' && session.status === 'complete') {
        if (intent?.status !== 'succeeded' || intent.currency !== 'usd'
          || intent.livemode !== production || object(intent.metadata)?.order_reference !== order.reference
          || received !== order.totalCents || intent.amount !== order.totalCents) {
          return { status: 'payment_review', receivedCents: received, detail: 'stripe_payment_mismatch' }
        }
        return { status: 'paid', receivedCents: received, detail: 'stripe_payment_confirmed' }
      }
      return { status: 'pending', receivedCents: received, detail: 'stripe_payment_pending' }
    },
    async authenticate(headers, raw) {
      const parts = (headers.get('Stripe-Signature') ?? '').split(',')
      const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
      if (!timestamp || !recentTimestamp(timestamp)) return false
      const signatures = parts.filter((part) => part.startsWith('v1=')).slice(0, 10)
        .map((part) => hexBytes(part.slice(3)))
      if (!await verifyHmac(new TextEncoder().encode(webhookSecret), `${timestamp}.${raw}`, signatures)) {
        return false
      }
      const event = parseWebhook(raw)
      const kind = string(event?.type)
      if (!event || event.livemode !== production || !kind) return false
      if (!checkoutEvents.has(kind)) return null
      const eventKey = providerId(event.id)
      const sessionId = providerId(object(object(event.data)?.object)?.id)
      return eventKey && sessionId?.startsWith('cs_') ? { eventKey, providerId: sessionId } : null
    },
  }
}
