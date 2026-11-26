import type { GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway } from './contracts'
import {
  cents, hexBytes, object, parseWebhook, ProviderError, providerId,
  providerJson, recentTimestamp, string, verifyHmac,
} from './provider-http'

const base = 'https://api.mercury.com/api/v1'
const eligibleKinds = new Set([
  'externalTransfer', 'internalTransfer', 'incomingDomesticWire', 'incomingInternationalWire',
])

export function mercuryGateway(env: PaymentEnv): PaymentGateway | null {
  const token = env.MERCURY_API_TOKEN
  const accountId = providerId(env.MERCURY_ACCOUNT_ID)
  const webhookSecret = env.MERCURY_WEBHOOK_SECRET
  if (env.ENVIRONMENT !== 'production' || env.MERCURY_ENABLED !== 'true'
    || env.MERCURY_EGRESS_APPROVED !== 'true' || env.MERCURY_TRANSFER_APPROVED !== 'true'
    || !token || !accountId || !webhookSecret) return null

  function call(path: string, body?: object): Promise<unknown> {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    return providerJson(`${base}${path}`, body
      ? { method: 'POST', body: JSON.stringify(body), headers }
      : { headers })
  }

  async function find(
    resource: 'customers' | 'invoices',
    match: (record: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown> | null> {
    const query = new URLSearchParams({
      order: 'desc', limit: resource === 'customers' ? '1000' : '100',
    })
    for (let page = 0; page < 5; page++) {
      const list = object(await call(`/ar/${resource}?${query}`))
      const entries = list?.[resource]
      if (!Array.isArray(entries)) throw new ProviderError(null, 'invalid_mercury_list')
      for (const entry of entries as unknown[]) {
        const record = object(entry)
        if (record && match(record)) return record
      }
      const next = providerId(object(list?.page)?.nextPage)
      if (!next || next === query.get('start_after')) return null
      query.set('start_after', next)
    }
    throw new ProviderError(null, 'mercury_lookup_limit')
  }

  function matches(invoice: Record<string, unknown>, order: GatewayOrder): boolean {
    return invoice.invoiceNumber === order.reference
      && invoice.currencyCode === order.currency
      && invoice.destinationAccountId === accountId
      && cents(invoice.amount) === order.totalCents
  }

  function checkout(data: unknown, order: GatewayOrder, customerId: string): HostedCheckout {
    const invoice = object(data)
    const id = providerId(invoice?.id)
    const slug = providerId(invoice?.slug)
    if (!invoice || !id || !slug || !matches(invoice, order) || invoice.customerId !== customerId) {
      throw new ProviderError(null, 'mercury_invoice_mismatch')
    }
    return { providerId: id, url: `https://app.mercury.com/pay/${slug}` }
  }

  async function transaction(id: string): Promise<Record<string, unknown> | null> {
    return object(await call(`/transaction/${id}`))
  }

  function settledAmount(record: Record<string, unknown> | null, id: string): number | null {
    const convertedTo = object(record?.currencyExchangeInfo)?.convertedToCurrency
    if (!record || record.id !== id || record.accountId !== accountId || record.status !== 'sent'
      || !eligibleKinds.has(string(record.kind) ?? '') || !string(record.postedAt)
      || (convertedTo && convertedTo !== 'USD')) return null
    return cents(record.amount)
  }

  return {
    label: 'Bank transfer (ACH or wire)',
    async create(order) {
      const customerMatches = (customer: Record<string, unknown>) =>
        !customer.deletedAt && string(customer.email)?.toLowerCase() === order.email.toLowerCase()
      const existing = await find('customers', customerMatches)
      const customer = existing ?? object(await call('/ar/customers', {
        name: order.buyerName, email: order.email,
      }))
      const customerId = providerId(customer?.id)
      if (!customer || !customerId || !customerMatches(customer)) {
        throw new ProviderError(null, 'mercury_customer_mismatch')
      }
      const now = Date.now()
      const lineItems = [
        { name: `Crest & Carat order ${order.reference}`, amount: order.subtotalCents },
        { name: 'Shipping', amount: order.shippingCents },
        { name: 'Sales tax', amount: order.taxCents },
      ].filter(({ amount }) => amount > 0)
        .map(({ name, amount }) => ({ name, quantity: 1, unitPrice: amount / 100 }))
      return checkout(await call('/ar/invoices', {
        invoiceNumber: order.reference,
        achDebitEnabled: env.MERCURY_ACH_DEBIT_ENABLED === 'true',
        creditCardEnabled: false,
        currencyCode: order.currency,
        customerId,
        destinationAccountId: accountId,
        invoiceDate: new Date(now).toISOString().slice(0, 10),
        dueDate: new Date(now + 14 * 86_400_000).toISOString().slice(0, 10),
        ccEmails: [],
        lineItems,
        payerMemo: `Use ${order.reference} as your payment reference.`,
        sendEmailOption: 'DontSend',
        useRealAccountNumber: false,
      }), order, customerId)
    },
    async recover(order) {
      const invoice = await find('invoices', (entry) => entry.invoiceNumber === order.reference)
      if (!invoice) return null
      const customerId = providerId(invoice.customerId)
      if (!customerId) throw new ProviderError(null, 'invalid_mercury_customer')
      const customer = object(await call(`/ar/customers/${customerId}`))
      if (customer?.id !== customerId || string(customer.email)?.toLowerCase() !== order.email.toLowerCase()) {
        throw new ProviderError(null, 'mercury_customer_mismatch')
      }
      return checkout(invoice, order, customerId)
    },
    async reconcile(order, id) {
      const invoice = object(await call(`/ar/invoices/${id}`))
      if (!invoice || invoice.id !== id || !matches(invoice, order)) {
        return { status: 'payment_review', receivedCents: 0, detail: 'mercury_invoice_mismatch' }
      }
      const paymentResponse = object(await call(`/ar/invoices/${id}/payments`))
      const payments = paymentResponse?.payments
      if (!Array.isArray(payments)) throw new ProviderError(null, 'invalid_mercury_payments')
      if (payments.length > 6) {
        return { status: 'payment_review', receivedCents: 0, detail: 'mercury_too_many_applied_payments' }
      }
      const paymentIds = new Set<string>()
      const transactionIds = new Set<string>()
      let receivedCents = 0
      let exception = invoice.status === 'Cancelled'
      for (const value of payments as unknown[]) {
        const applied = object(value)
        const paymentId = providerId(applied?.id)
        const amount = cents(applied?.amount)
        const linkedTransaction = object(applied?.transaction)
        const transactionId = providerId(linkedTransaction?.id)
        if (!paymentId || !transactionId || !amount || applied?.currencyCode !== order.currency
          || applied.type !== 'transaction' || !linkedTransaction
          || !eligibleKinds.has(string(linkedTransaction.kind) ?? '')
          || paymentIds.has(paymentId) || transactionIds.has(transactionId)) {
          exception = true
          continue
        }
        paymentIds.add(paymentId)
        transactionIds.add(transactionId)
        const fullTransaction = await transaction(transactionId)
        if (fullTransaction?.status === 'pending' && linkedTransaction.status === 'pending') continue
        if (linkedTransaction.status !== 'sent' || settledAmount(fullTransaction, transactionId) !== amount
          || fullTransaction?.kind !== linkedTransaction.kind) {
          exception = true
          continue
        }
        receivedCents += amount
      }
      if (exception || receivedCents > order.totalCents
        || (invoice.status === 'Paid' && receivedCents !== order.totalCents)) {
        return { status: 'payment_review', receivedCents, detail: 'mercury_payment_exception', appliedTransactionIds: transactionIds }
      }
      if (receivedCents === order.totalCents && invoice.status === 'Paid') {
        return { status: 'paid', receivedCents, detail: 'mercury_settled_payment_confirmed', appliedTransactionIds: transactionIds }
      }
      if (receivedCents > 0 && receivedCents < order.totalCents) {
        return { status: 'partial', receivedCents, detail: 'mercury_partial_payment', appliedTransactionIds: transactionIds }
      }
      return { status: 'pending', receivedCents, detail: 'mercury_payment_pending', appliedTransactionIds: transactionIds }
    },
    async authenticate(headers, raw) {
      const parts = (headers.get('Mercury-Signature') ?? '').split(',').map((value) => value.trim())
      const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
      if (!timestamp || !recentTimestamp(timestamp)) return false
      const signatures = parts.filter((part) => part.startsWith('v1=')).slice(0, 10)
        .map((part) => hexBytes(part.slice(3)))
      if (!await verifyHmac(new TextEncoder().encode(webhookSecret), `${timestamp}.${raw}`, signatures)) {
        return false
      }
      const event = parseWebhook(raw)
      if (event?.resourceType !== 'transaction') return null
      const eventKey = providerId(event.id)
      const transactionId = providerId(event.resourceId)
      return eventKey && transactionId ? { eventKey, transactionId } : null
    },
    async findUnapplied(id) {
      const record = await transaction(id)
      const reference = providerId(record?.externalMemo)
      const amount = settledAmount(record, id)
      return reference && amount ? { reference, amount } : null
    },
  }
}
