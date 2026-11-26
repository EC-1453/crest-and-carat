import type { GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway } from './contracts'
import { integer, object, ProviderError, providerId, providerJson, string } from './provider-http'

export function relayGateway(env: PaymentEnv): PaymentGateway | null {
  const base = env.RELAY_BRIDGE_URL?.replace(/\/$/, '')
  const hostedOrigin = env.RELAY_HOSTED_ORIGIN?.replace(/\/$/, '')
  const token = env.RELAY_BRIDGE_TOKEN
  if (env.ENVIRONMENT !== 'production' || env.RELAY_ENABLED !== 'true' || !token || token.length < 32
    || !base || !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9/_-]+)?$/i.test(base)
    || !hostedOrigin || !/^https:\/\/(?:[a-z0-9-]+\.)*relayfi\.com$/.test(hostedOrigin)) return null

  function call(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Content-Type', 'application/json')
    return providerJson(`${base}${path}`, { ...options, headers })
  }

  function checkout(value: unknown, order: GatewayOrder): HostedCheckout {
    const data = object(value)
    const id = providerId(data?.providerId)
    const url = string(data?.url)
    if (!data || data.reference !== order.reference || data.currency !== order.currency
      || data.amountCents !== order.totalCents || !id || !url
      || !url.startsWith(`${hostedOrigin}/`)) {
      throw new ProviderError(null, 'relay_checkout_mismatch')
    }
    return { providerId: id, url }
  }

  return {
    label: 'Relay bank transfer',
    async create(order) {
      const response = await call('/requests', {
        method: 'POST',
        headers: { 'Idempotency-Key': order.reference },
        body: JSON.stringify({
          reference: order.reference, currency: order.currency, amountCents: order.totalCents,
          email: order.email, name: order.buyerName, methods: ['ach', 'wire'],
        }),
      })
      return checkout(response, order)
    },
    async recover(order) {
      try {
        return checkout(await call(`/requests/by-reference/${order.reference}`), order)
      } catch (error) {
        if (error instanceof ProviderError && error.status === 404) return null
        throw error
      }
    },
    async reconcile(order, id) {
      const data = object(await call(`/requests/${id}`))
      const receivedCents = integer(data?.receivedCents) ?? 0
      if (!data || data.providerId !== id || data.reference !== order.reference
        || data.currency !== order.currency || data.amountCents !== order.totalCents
        || receivedCents > order.totalCents || data.status === 'exception') {
        return { status: 'payment_review', receivedCents, detail: 'relay_payment_exception' }
      }
      if (data.status === 'settled' && receivedCents === order.totalCents
        && providerId(data.transactionId) && typeof data.settledAt === 'string'
        && Number.isFinite(Date.parse(data.settledAt))) {
        return { status: 'paid', receivedCents, detail: 'relay_payment_confirmed' }
      }
      if (receivedCents > 0 && receivedCents < order.totalCents) {
        return { status: 'partial', receivedCents, detail: 'relay_partial_payment' }
      }
      return { status: 'pending', receivedCents, detail: 'relay_payment_pending' }
    },
  }
}
