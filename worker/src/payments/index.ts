import type {
  GatewayOrder, HostedCheckout, PaymentEnv, PaymentGateway, PaymentObservation, ProcessorName,
  StoredPaymentOrder,
} from './contracts'
import { airwallexGateway } from './airwallex'
import { helcimGateway } from './helcim'
import { mercuryGateway } from './mercury'
import { object, ProviderError, providerId, string } from './provider-http'
import { relayGateway } from './relay'
import { stripeGateway } from './stripe'

export type { PaymentEnv, ProcessorName } from './contracts'

const paymentGateways: Record<ProcessorName, (env: PaymentEnv) => PaymentGateway | null> = {
  mercury: mercuryGateway,
  helcim: helcimGateway,
  stripe: stripeGateway,
  airwallex: airwallexGateway,
  nickel: () => null, // Enable only after a documented and approved merchant integration.
  relay: relayGateway,
}

const orderColumns = `
  id, order_reference, email, address_json, processor, status, currency, subtotal_cents, shipping_cents,
  tax_cents, total_cents, provider_payment_id, received_cents, checkout_state,
  checkout_claimed_at, last_payment_check_at, created_at
`

interface WebhookReceipt {
  id: string
  processor: ProcessorName
  provider_payment_id: string
}

function gateway(env: PaymentEnv, name: string): PaymentGateway | null {
  return Object.hasOwn(paymentGateways, name) ? paymentGateways[name as ProcessorName](env) : null
}

export function paymentProcessors(env: PaymentEnv): { id: ProcessorName, label: string }[] {
  return (Object.keys(paymentGateways) as ProcessorName[]).flatMap((id) => {
    const adapter = gateway(env, id)
    return adapter ? [{ id, label: adapter.label }] : []
  })
}

function gatewayOrder(order: StoredPaymentOrder): GatewayOrder {
  const address = object(JSON.parse(order.address_json))
  const buyerName = string(address?.fullName)
  const line1 = string(address?.line1)
  const city = string(address?.city)
  const country = string(address?.country)
  if (!address || !buyerName || !line1 || !city || !country || !providerId(order.order_reference)) {
    throw new ProviderError(null, 'invalid_order_snapshot')
  }
  return {
    id: order.id,
    reference: order.order_reference,
    email: order.email,
    buyerName,
    currency: order.currency,
    totalCents: order.total_cents,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    taxCents: order.tax_cents,
    createdAt: order.created_at,
    checkoutClaimedAt: order.checkout_claimed_at,
    shippingAddress: {
      line1, city, country,
      line2: string(address.line2) ?? '',
      state: string(address.state) ?? '',
      postalCode: string(address.postalCode) ?? '',
    },
  }
}

function event(
  db: D1Database,
  processor: string,
  key: string,
  orderId: string | null,
  status: string,
  receivedCents: number,
  providerId: string | null,
  detail: string,
  now: string,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO payment_events (id, processor, event_key, order_id, status, received_cents,
                                provider_payment_id, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (processor, event_key) DO NOTHING
  `).bind(crypto.randomUUID(), processor, key, orderId, status, receivedCents, providerId, detail, now)
}

function checkoutReady(db: D1Database, order: StoredPaymentOrder, checkout: HostedCheckout): Promise<D1Result[]> {
  const now = new Date().toISOString()
  return db.batch([
    db.prepare(`
      UPDATE orders
      SET provider_payment_id = ?, checkout_url = ?, checkout_state = 'ready', updated_at = ?
      WHERE id = ? AND checkout_state IN ('creating', 'uncertain') AND provider_payment_id IS NULL
    `).bind(checkout.providerId, checkout.url || null, now, order.id),
    event(db, order.processor, `checkout-ready:${order.id}`, order.id, 'checkout_ready',
      0, checkout.providerId, 'hosted_checkout_saved', now),
  ])
}

function checkoutUncertain(db: D1Database, order: StoredPaymentOrder, detail: string): Promise<D1Result[]> {
  const now = new Date().toISOString()
  return db.batch([
    db.prepare(`
      UPDATE orders SET checkout_state = 'uncertain', updated_at = ?
      WHERE id = ? AND checkout_state = 'creating' AND provider_payment_id IS NULL
    `).bind(now, order.id),
    event(db, order.processor, `checkout-uncertain:${order.id}`, order.id, 'checkout_uncertain',
      0, null, detail, now),
  ])
}

export async function startCheckout(env: PaymentEnv, orderId: string, returnUrl: string): Promise<void> {
  const order = await env.DB.prepare(`SELECT ${orderColumns} FROM orders WHERE id = ?`)
    .bind(orderId).first<StoredPaymentOrder>()
  if (!order || order.status !== 'pending' || order.checkout_state !== 'new') return
  const adapter = gateway(env, order.processor)
  if (!adapter) return
  const safeReturnUrl = new URL(returnUrl)
  if (safeReturnUrl.origin !== env.STOREFRONT_ORIGIN || safeReturnUrl.username || safeReturnUrl.password) {
    throw new ProviderError(null, 'invalid_checkout_return_url')
  }
  const snapshot = gatewayOrder(order)
  const now = new Date().toISOString()
  const claim = await env.DB.prepare(`
    UPDATE orders SET checkout_state = 'creating', checkout_claimed_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' AND checkout_state = 'new'
  `).bind(now, now, order.id).run()
  if (claim.meta.changes !== 1) return
  try {
    const checkout = await adapter.create({ ...snapshot, checkoutClaimedAt: now }, safeReturnUrl.toString())
    await checkoutReady(env.DB, order, checkout)
  } catch (error) {
    // The provider may have created the object before the connection or D1 write failed.
    // Only look it up by reference once the claim has been made.
    await checkoutUncertain(env.DB, order,
      error instanceof ProviderError ? error.code : 'checkout_create_interrupted')
  }
}

function nextCheck(order: StoredPaymentOrder): string {
  const previous = Date.parse(order.last_payment_check_at ?? '')
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}

async function recordObservation(
  db: D1Database, order: StoredPaymentOrder, observation: PaymentObservation,
): Promise<void> {
  let { status, receivedCents, detail } = observation
  if (status === 'paid' && receivedCents !== order.total_cents) {
    status = 'payment_review'
    detail = 'settled_amount_mismatch'
  }
  if (order.status === 'payment_review' && (status === 'pending' || status === 'partial'
    || order.received_cents > order.total_cents)) {
    status = 'payment_review'
    receivedCents = Math.max(receivedCents, order.received_cents)
  }
  const now = nextCheck(order)
  const update = db.prepare(`
    UPDATE orders SET status = ?, received_cents = ?, updated_at = ?, last_payment_check_at = ?,
      paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END
    WHERE id = ? AND status <> 'paid' AND provider_payment_id IS ? AND last_payment_check_at IS ?
  `).bind(status, receivedCents, now, now, status, now, order.id,
    order.provider_payment_id, order.last_payment_check_at)
  const audit = event(db, order.processor, `observation:${order.id}:${status}:${receivedCents}:${detail}`,
    order.id, status, receivedCents, order.provider_payment_id, detail, now)
  await db.batch([update, audit])
}

async function nextCheckOnly(db: D1Database, order: StoredPaymentOrder): Promise<void> {
  await db.prepare(`
    UPDATE orders SET last_payment_check_at = ? WHERE id = ? AND last_payment_check_at IS ?
  `).bind(nextCheck(order), order.id, order.last_payment_check_at).run()
}

async function reconcileOrder(
  env: PaymentEnv,
  order: StoredPaymentOrder,
  adapter: PaymentGateway,
  unapplied?: { transactionId: string, amount: number },
): Promise<void> {
  if (order.status === 'paid') return
  const snapshot = gatewayOrder(order)
  let id = providerId(order.provider_payment_id)
  if (!id) {
    const claimedAt = Date.parse(order.checkout_claimed_at ?? '')
    if (order.checkout_state === 'new'
      || (order.checkout_state === 'creating' && !(claimedAt < Date.now() - 30_000))) return
    const checkout = await adapter.recover(snapshot)
    if (!checkout) {
      await checkoutUncertain(env.DB, order, 'checkout_recovery_pending')
      await nextCheckOnly(env.DB, order)
      return
    }
    await checkoutReady(env.DB, order, checkout)
    id = checkout.providerId
  }
  let observation = await adapter.reconcile(snapshot, id)
  if (unapplied && !observation.appliedTransactionIds?.has(unapplied.transactionId)) {
    observation = {
      status: 'payment_review',
      receivedCents: observation.receivedCents + unapplied.amount,
      detail: 'mercury_unapplied_transfer',
    }
  }
  await recordObservation(env.DB, { ...order, provider_payment_id: id }, observation)
}

async function oldestOrder(env: PaymentEnv, processor: ProcessorName): Promise<StoredPaymentOrder | null> {
  return env.DB.prepare(`
    SELECT ${orderColumns} FROM orders
    WHERE processor = ? AND status <> 'paid' AND checkout_state = 'ready'
      AND (last_payment_check_at IS NULL OR last_payment_check_at < ?)
    ORDER BY coalesce(last_payment_check_at, created_at), id LIMIT 1
  `).bind(processor, new Date(Date.now() - 30_000).toISOString()).first<StoredPaymentOrder>()
}

async function processReceipt(env: PaymentEnv, receipt: WebhookReceipt): Promise<void> {
  const adapter = gateway(env, receipt.processor)
  const providerId = receipt.provider_payment_id
  if (!adapter) return
  const now = Date.now()
  const claimed = await env.DB.prepare(`
    UPDATE payment_events SET last_attempt_at = ?
    WHERE id = ? AND status = 'webhook_received' AND (last_attempt_at IS NULL OR last_attempt_at < ?)
  `).bind(new Date(now).toISOString(), receipt.id, new Date(now - 90_000).toISOString()).run()
  if (claimed.meta.changes !== 1) return
  let order: StoredPaymentOrder | null = null
  let relatedOrderId: string | null = null
  let possibleUnapplied: { transactionId: string, amount: number } | undefined
  if (adapter.findUnapplied) {
    const payment = await adapter.findUnapplied(providerId)
    if (payment) {
      order = await env.DB.prepare(`
        SELECT ${orderColumns} FROM orders WHERE processor = ? AND order_reference = ?
      `).bind(receipt.processor, payment.reference).first<StoredPaymentOrder>()
      if (order) {
        relatedOrderId = order.id
        possibleUnapplied = { transactionId: providerId, amount: payment.amount }
      }
    }
    order ??= await oldestOrder(env, receipt.processor)
  } else if (adapter.resolveReference) {
    const reference = await adapter.resolveReference(providerId)
    if (reference) {
      order = await env.DB.prepare(`
        SELECT ${orderColumns} FROM orders WHERE processor = ? AND order_reference = ?
      `).bind(receipt.processor, reference).first<StoredPaymentOrder>()
      relatedOrderId = order?.id ?? null
    }
  } else {
    order = await env.DB.prepare(`
      SELECT ${orderColumns} FROM orders WHERE processor = ? AND provider_payment_id = ?
    `).bind(receipt.processor, providerId).first<StoredPaymentOrder>()
    relatedOrderId = order?.id ?? null
  }
  if (order) await reconcileOrder(env, order, adapter, possibleUnapplied)
  await env.DB.prepare(`
    UPDATE payment_events SET status = 'webhook_processed', order_id = ?, detail = 'provider_event_checked'
    WHERE id = ? AND status = 'webhook_received'
  `).bind(relatedOrderId, receipt.id).run()
}

function webhookResponse(status: number): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readWebhook(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  let bytes = 0
  let raw = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return raw + decoder.decode()
      bytes += chunk.value.byteLength
      if (bytes > 131_072) {
        await reader.cancel()
        return null
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

export async function handlePaymentWebhook(
  request: Request, env: PaymentEnv, processor: ProcessorName,
  queueReconciliation?: (work: Promise<void>) => void,
): Promise<Response> {
  const adapter = gateway(env, processor)
  if (!adapter?.authenticate) return webhookResponse(404)
  const raw = await readWebhook(request).catch(() => undefined)
  if (raw === null) return webhookResponse(413)
  if (raw === undefined) return webhookResponse(400)
  const hint = await adapter.authenticate(request.headers, raw)
  if (hint === false) return webhookResponse(401)
  const relatedId = hint?.providerId ?? hint?.transactionId
  const accepted = processor === 'airwallex' ? 200 : 204
  if (!hint || !relatedId) return webhookResponse(accepted)
  const eventKey = `webhook:${hint.eventKey}`
  const now = new Date().toISOString()
  await event(env.DB, processor, eventKey, null, 'webhook_received', 0, relatedId, 'provider_event_verified', now).run()
  const receipt = await env.DB.prepare(`
    SELECT id, processor, provider_payment_id FROM payment_events
    WHERE processor = ? AND event_key = ? AND status = 'webhook_received'
  `).bind(processor, eventKey).first<WebhookReceipt>()
  if (!receipt) return webhookResponse(accepted)
  const work = processReceipt(env, receipt)
  if ((processor === 'mercury' || processor === 'airwallex') && queueReconciliation) {
    // D1 preserves work for Cron if the scheduled attempt fails after acknowledgement.
    queueReconciliation(work.catch(() => undefined))
    return webhookResponse(accepted)
  }
  return work.then(() => webhookResponse(accepted), () => webhookResponse(503))
}

export async function reconcilePayments(env: PaymentEnv): Promise<void> {
  const processors = paymentProcessors(env).map(({ id }) => id)
  if (!processors.length) return
  const enabled = processors.map(() => '?').join(', ')
  const unfinished = await env.DB.prepare(`
    SELECT id, processor, provider_payment_id FROM payment_events
    WHERE status = 'webhook_received' AND processor IN (${enabled})
      AND (last_attempt_at IS NULL OR last_attempt_at < ?)
    ORDER BY last_attempt_at, created_at, id LIMIT 1
  `).bind(...processors, new Date(Date.now() - 90_000).toISOString()).all<WebhookReceipt>()
  for (const receipt of unfinished.results) {
    try {
      await processReceipt(env, receipt)
    } catch {
      // An unsuccessful attempt leaves the receipt available for the next scheduled run.
    }
  }
  const candidates = await env.DB.prepare(`
    SELECT ${orderColumns} FROM orders
    WHERE status <> 'paid' AND processor IN (${enabled}) AND (
      checkout_state IN ('ready', 'uncertain') OR
      (checkout_state = 'creating' AND checkout_claimed_at < ?)
    )
    ORDER BY coalesce(last_payment_check_at, created_at), id LIMIT 3
  `).bind(...processors, new Date(Date.now() - 30_000).toISOString()).all<StoredPaymentOrder>()
  for (const order of candidates.results) {
    const adapter = gateway(env, order.processor)
    if (!adapter) continue
    try {
      await reconcileOrder(env, order, adapter)
    } catch (error) {
      const detail = error instanceof ProviderError ? error.code : 'reconciliation_interrupted'
      await event(env.DB, order.processor, `reconcile-error:${order.id}:${detail}`, order.id,
        'provider_error', order.received_cents, order.provider_payment_id, detail, nextCheck(order)).run()
      await nextCheckOnly(env.DB, order)
    }
  }
}
