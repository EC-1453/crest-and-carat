import type { GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway } from './contracts'
import {
  base64Bytes, cents, object, parseWebhook, ProviderError, providerId, providerJson,
  recentTimestamp, string, verifyHmac,
} from './provider-http'

function records(value: unknown, key?: string): unknown[] {
  if (Array.isArray(value)) return value
  const rows = key ? object(value)?.[key] : null
  if (Array.isArray(rows)) return rows
  throw new ProviderError(null, 'invalid_helcim_list')
}

function approvedCard(record: Record<string, unknown>): boolean {
  return record.status === 'APPROVED' || record.status === 'APPROVAL'
}

export function helcimGateway(env: PaymentEnv): PaymentGateway | null {
  const apiToken = env.HELCIM_API_TOKEN
  const verifier = base64Bytes(env.HELCIM_WEBHOOK_SECRET ?? '')
  const origin = env.HELCIM_HOSTED_ORIGIN?.replace(/\/$/, '')
  if (env.ENVIRONMENT !== 'production' || env.HELCIM_ENABLED !== 'true' || !apiToken
    || !verifier || verifier.length < 16 || !origin
    || !/^https:\/\/[a-z0-9][a-z0-9-]*\.myhelcim\.com$/.test(origin)) return null

  function call(path: string, body?: object): Promise<unknown> {
    const headers = { 'api-token': apiToken ?? '', 'Content-Type': 'application/json' }
    return providerJson(`https://api.helcim.com/v2${path}`, body
      ? { method: 'POST', body: JSON.stringify(body), headers }
      : { headers })
  }

  function matches(invoice: Record<string, unknown>, order: GatewayOrder): boolean {
    return invoice.invoiceNumber === order.reference
      && invoice.currency === order.currency
      && cents(invoice.amount) === order.totalCents
  }

  function checkout(data: unknown, order: GatewayOrder): HostedCheckout {
    const invoice = object(data)
    const id = providerId(invoice?.invoiceId)
    const token = providerId(invoice?.token)
    if (!invoice || !id || !token || !matches(invoice, order)) {
      throw new ProviderError(null, 'helcim_invoice_mismatch')
    }
    return { providerId: id, url: `${origin}/order/?token=${encodeURIComponent(token)}` }
  }

  return {
    label: 'Helcim secure checkout',
    async create(order) {
      const address = order.shippingAddress
      const invoice = await call('/invoices', {
        invoiceNumber: order.reference,
        currency: order.currency,
        type: 'INVOICE',
        status: 'DUE',
        convenienceFeeEnabled: false,
        shipping: {
          amount: order.shippingCents / 100,
          address: {
            name: order.buyerName, street1: address.line1, street2: address.line2,
            city: address.city, province: address.state, country: address.country,
            postalCode: address.postalCode, email: order.email,
          },
        },
        tax: { amount: order.taxCents / 100 },
        lineItems: [{
          sku: 'CREST-CARAT-ORDER', description: `Crest & Carat order ${order.reference}`,
          quantity: 1, price: order.subtotalCents / 100,
        }],
      })
      return checkout(invoice, order)
    },
    async recover(order) {
      const query = new URLSearchParams({ invoiceNumber: order.reference, limit: '100' })
      const matching = records(await call(`/invoices?${query}`), 'invoices')
        .filter((entry) => object(entry)?.invoiceNumber === order.reference)
      if (!matching.length) return null
      if (matching.length !== 1) throw new ProviderError(null, 'duplicate_helcim_invoice')
      const id = providerId(object(matching[0])?.invoiceId)
      if (!id) throw new ProviderError(null, 'invalid_helcim_invoice')
      return checkout(await call(`/invoices/${id}`), order)
    },
    async reconcile(order, id) {
      const invoice = object(await call(`/invoices/${id}`))
      if (!invoice || providerId(invoice.invoiceId) !== id || !matches(invoice, order)) {
        return { status: 'payment_review', receivedCents: 0, detail: 'helcim_invoice_mismatch' }
      }
      const cardQuery = new URLSearchParams({ invoiceNumber: order.reference, limit: '100' })
      const cardRecords = records(await call(`/card-transactions?${cardQuery}`), 'transactions')
      const ids = new Set<string>()
      let receivedCents = 0
      let exception = invoice.status === 'CANCELLED' || cardRecords.length >= 100
      for (const entry of cardRecords) {
        const card = object(entry)
        if (!card || card.invoiceNumber !== order.reference || !approvedCard(card)) continue
        const type = string(card.type)?.toLowerCase()
        if (type === 'refund' || type === 'reverse' || type === 'reversal' || type === 'void') {
          exception = true
          continue
        }
        if (type !== 'purchase') continue
        const transactionId = providerId(card.transactionId)
        const amount = cents(card.amount)
        if (!transactionId || ids.has(transactionId) || card.currency !== order.currency || !amount
          || card.test === true || card.test === 1) {
          exception = true
          continue
        }
        ids.add(transactionId)
        receivedCents += amount
      }

      const achQuery = new URLSearchParams({ search: id, limit: '125', page: '1' })
      const achRecords = env.HELCIM_ACH_ENABLED === 'true'
        ? records(await call(`/ach/transactions?${achQuery}`), 'transactions')
        : []
      if (achRecords.length >= 125) exception = true
      for (const entry of achRecords) {
        const ach = object(object(entry)?.transaction) ?? object(entry)
        if (!ach || providerId(ach.orderId) !== id) continue
        if (ach.statusClearing === 2 || ach.statusClearing === 3 || ach.statusClearing === 4) {
          exception = true
          continue
        }
        if (ach.statusAuth !== 1 || ach.statusClearing !== 1) continue
        const transactionId = providerId(ach.id)
        const amount = cents(ach.amount)
        if (!transactionId || ids.has(`ach-${transactionId}`) || ach.currency !== 2 || !amount
          || ach.transactionType !== 1 || ach.test !== 0) {
          exception = true
          continue
        }
        ids.add(`ach-${transactionId}`)
        receivedCents += amount
      }
      if (exception || receivedCents > order.totalCents) {
        return { status: 'payment_review', receivedCents, detail: 'helcim_payment_exception' }
      }
      if (invoice.status === 'PAID' && receivedCents === order.totalCents) {
        return { status: 'paid', receivedCents, detail: 'helcim_payment_confirmed' }
      }
      if (receivedCents > 0 && receivedCents < order.totalCents) {
        return { status: 'partial', receivedCents, detail: 'helcim_partial_payment' }
      }
      return { status: 'pending', receivedCents, detail: 'helcim_payment_pending' }
    },
    async authenticate(headers, raw) {
      const eventKey = providerId(headers.get('webhook-id'))
      const timestamp = headers.get('webhook-timestamp')
      if (!eventKey || !timestamp || !recentTimestamp(timestamp)) return false
      const signatures = (headers.get('webhook-signature') ?? '').split(/\s+/)
        .filter((part) => part.startsWith('v1,')).slice(0, 10).map((part) => base64Bytes(part.slice(3)))
      if (!await verifyHmac(verifier, `${eventKey}.${timestamp}.${raw}`, signatures)) return false
      const event = parseWebhook(raw)
      if (event?.type !== 'cardTransaction') return null
      const transactionId = providerId(event.id)
      return transactionId && /^\d+$/.test(transactionId) ? { eventKey, transactionId } : null
    },
    async resolveReference(transactionId) {
      const record = object(await call(`/card-transactions/${transactionId}`))
      if (providerId(record?.transactionId) !== transactionId) return null
      return providerId(record?.invoiceNumber)
    },
  }
}
