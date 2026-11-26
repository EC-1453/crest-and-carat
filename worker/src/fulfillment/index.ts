import { hasSigningSecret, trackingLink, type SecurityEnv } from '../security'
import { emailAddress, emailStatement, merchantAddress, sendQueuedEmails, senderAddress, type EmailEnv } from './email'
import {
  SupplierError, supplierAdapters, type FulfillmentItem, type Shipment, type ShippingAddress, type SupplierAdapter, type SupplierEnv,
} from './suppliers'

export interface FulfillmentEnv extends EmailEnv, SecurityEnv, SupplierEnv {}

interface PaidOrder {
  id: string
  order_reference: string
  email: string
  address_json: string
  created_at: string
}

type JobStatus = 'queued' | 'submitting' | 'reconciling' | 'manual' | 'submitted' | 'shipped'

interface Job {
  id: string
  order_id: string
  merchant_reference: string
  supplier: string
  supplier_reference: string | null
  status: JobStatus
  attempts: number
  next_attempt_at: string
  created_at: string
}

interface ShipmentJob extends Job {
  email: string
  order_reference: string
}

export interface ShipmentInput extends Shipment {
  merchantReference: string
}

export class ShipmentInputError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message)
  }
}

const minute = 60_000
const hour = 60 * minute
const later = (milliseconds: number): string => new Date(Date.now() + milliseconds).toISOString()
const encoder = new TextEncoder()
const carrierHosts = ['ups.com', 'fedex.com', 'dhl.com', 'dhl.de', 'usps.com', 'aramex.com']

async function keyFor(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(parts)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function privateOrderLink(env: FulfillmentEnv, orderReference: string): Promise<string | undefined> {
  return hasSigningSecret(env) ? trackingLink(env, orderReference).catch(() => undefined) : undefined
}

function shippingAddress(json: string): ShippingAddress | null {
  const data: unknown = JSON.parse(json)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const { fullName, line1, line2, city, state, postalCode, country } = data as Record<string, unknown>
  if (typeof fullName !== 'string' || !fullName || typeof line1 !== 'string' || !line1
    || typeof city !== 'string' || !city || typeof state !== 'string' || typeof postalCode !== 'string'
    || typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) return null
  return { fullName, line1, city, region: state, postalCode, country, ...(typeof line2 === 'string' ? { line2 } : {}) }
}

function itemSummary(items: FulfillmentItem[]): string[] {
  return items.map((item) => {
    const base = `${item.quantity} × ${item.name} · ${item.variant_name} · ${item.sku}`
    return item.engraving ? `${base}\nEngraving: “${item.engraving}”` : base
  })
}

function audit(
  env: FulfillmentEnv,
  eventId: string,
  jobId: string,
  type: string,
  detail: string | null,
  now: string,
  lease?: string,
): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO fulfillment_events (id, job_id, event_type, detail, created_at)
    SELECT ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM fulfillment_jobs WHERE id = ?${lease ? ' AND lease_token = ?' : ''})
    ON CONFLICT(id) DO NOTHING`).bind(eventId, jobId, type, detail, now, jobId, ...(lease ? [lease] : []))
}

function manualNotice(env: FulfillmentEnv, now: string, order: PaidOrder, jobId: string, reference: string,
  reason: string, items: FulfillmentItem[], lease?: string): D1PreparedStatement {
  return emailStatement(env, now, {
    id: `manual-${jobId}`, orderId: order.id, kind: 'manual_fulfillment', to: merchantAddress(),
    subject: `Fulfillment review for ${order.order_reference}`, heading: 'Fulfillment review required',
    paragraphs: [
      `Order ${order.order_reference} was paid. Review fulfillment reference ${reference} before placing or updating a supplier order.`,
      `Queue reason: ${reason}.`,
    ], lines: itemSummary(items),
  }, lease ? { jobId, lease } : undefined)
}

async function enqueueOrder(env: FulfillmentEnv, order: PaidOrder, adapters: Map<string, SupplierAdapter>): Promise<void> {
  const { results: items } = await env.DB.prepare(`SELECT line_number, sku, name, variant_name, quantity,
    engraving, supplier_id, supplier_sku, supplier_api_approved FROM order_items WHERE order_id = ?
    ORDER BY line_number`).bind(order.id).all<FulfillmentItem>()
  if (!items.length) throw new Error('Paid order has no items')
  const address = shippingAddress(order.address_json)
  const groups = new Map<string, FulfillmentItem[]>()
  for (const item of items) {
    const adapter = adapters.get(item.supplier_id)
    const supplier = address && adapter?.canSubmit(item, address) ? adapter.id : 'manual'
    const group = groups.get(supplier) ?? []
    group.push(item)
    groups.set(supplier, group)
  }

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  for (const [supplier, group] of groups) {
    const id = await keyFor([order.id, supplier])
    const reference = `CC-${id.slice(0, 32).toUpperCase()}`
    const manualReason = supplier === 'manual' ? 'Automatic purchasing is unavailable for these items or this destination' : null
    const status = manualReason ? 'manual' : 'queued'
    statements.push(env.DB.prepare(`INSERT INTO fulfillment_jobs
      (id, order_id, supplier, merchant_reference, status, last_error, next_attempt_at, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND status = 'paid'
      ON CONFLICT(id) DO NOTHING`).bind(id, supplier, reference, status, manualReason, manualReason ? null : now, now, now, order.id))
    for (const item of group) {
      statements.push(env.DB.prepare(`INSERT INTO fulfillment_job_items (job_id, order_id, line_number)
        SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM fulfillment_jobs WHERE id = ?)
        ON CONFLICT(job_id, order_id, line_number) DO NOTHING`).bind(id, order.id, item.line_number, id))
    }
    statements.push(audit(env, `queued-${id}`, id, status, manualReason, now))
    if (manualReason) statements.push(manualNotice(env, now, order, id, reference, manualReason, group))
  }
  await env.DB.batch(statements)
}

async function jobItems(env: FulfillmentEnv, jobId: string): Promise<FulfillmentItem[]> {
  const { results } = await env.DB.prepare(`SELECT i.line_number, i.sku, i.name, i.variant_name, i.quantity, i.engraving,
      i.supplier_id, i.supplier_sku,
      CASE WHEN i.supplier_api_approved = 1 AND c.supplier_api_approved = 1 AND c.active = 1
        THEN 1 ELSE 0 END AS supplier_api_approved
    FROM fulfillment_job_items j INNER JOIN order_items i ON i.order_id = j.order_id AND i.line_number = j.line_number
    LEFT JOIN catalog_items c ON c.sku = i.sku AND c.supplier_id = i.supplier_id AND c.supplier_sku = i.supplier_sku
    WHERE j.job_id = ? ORDER BY i.line_number`).bind(jobId).all<FulfillmentItem>()
  return results
}

async function transition(
  env: FulfillmentEnv,
  job: Job,
  lease: string,
  status: JobStatus,
  detail: string | null,
  nextAttemptAt: string | null,
  supplierReference: string | null,
  sideEffects: D1PreparedStatement[] = [],
): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.batch([
    audit(env, `${job.id}-${lease}-${status}`, job.id, status, detail, now, lease),
    ...sideEffects,
    env.DB.prepare(`UPDATE fulfillment_jobs SET status = ?, supplier_reference = COALESCE(?, supplier_reference),
      last_error = ?, next_attempt_at = ?, lease_token = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(status, supplierReference, detail, nextAttemptAt, now, job.id, lease),
  ])
}

async function moveToManual(
  env: FulfillmentEnv, job: Job, lease: string, order: PaidOrder, items: FulfillmentItem[], reason: string,
  supplierReference: string | null = null,
): Promise<void> {
  const notice = manualNotice(env, new Date().toISOString(), order, job.id, job.merchant_reference, reason, items, lease)
  await transition(env, job, lease, 'manual', reason, null, supplierReference, [notice])
}

async function recordDispatch(
  env: FulfillmentEnv, job: Job, lease: string, order: PaidOrder,
  items: FulfillmentItem[], adapter: SupplierAdapter, reference: string,
): Promise<void> {
  const claim = { jobId: job.id, lease }
  const now = new Date().toISOString()
  const dispatchDetail = `Order ${order.order_reference}. Supplier order ${reference}. Purchase order ${job.merchant_reference}.`
  const messages = [
    emailStatement(env, now, {
      id: `merchant-dispatch-${job.id}`, orderId: order.id, kind: 'merchant_dispatch', to: merchantAddress(),
      subject: `Supplier accepted order ${order.order_reference}`, heading: 'Supplier order accepted',
      paragraphs: [dispatchDetail], lines: itemSummary(items),
    }, claim),
    emailStatement(env, now, {
      id: `buyer-dispatch-${job.id}`, orderId: order.id, kind: 'buyer_dispatch', to: order.email,
      subject: `An update on your Crest & Carat order ${order.order_reference}`, heading: 'Your order is being prepared',
      paragraphs: [`Items from order ${order.order_reference} are being prepared for shipment. We’ll email you when carrier tracking is available.`],
      link: await privateOrderLink(env, order.order_reference),
    }, claim),
  ]
  const supplierRecipient = emailAddress(adapter.dispatchEmail)
  if (supplierRecipient) {
    messages.push(emailStatement(env, now, {
      id: `supplier-dispatch-${job.id}`, orderId: order.id, kind: 'supplier_dispatch', to: supplierRecipient,
      subject: `Crest & Carat purchase order ${job.merchant_reference}`, heading: 'Purchase order reference',
      paragraphs: [`Our integration received confirmation for purchase order ${job.merchant_reference} as supplier order ${reference}. This is a confirmation of the submitted purchase order.`],
    }, claim))
  }
  await transition(env, job, lease, 'submitted', null, later(30 * minute), reference, messages)
}

function verifiedTrackingUrl(value: string | undefined): string | null {
  if (!value || value.length > 2_048) return null
  try {
    const url = new URL(value)
    const standardHost = carrierHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    return url.protocol === 'https:' && standardHost && !url.username && !url.password && !url.port ? url.toString() : null
  } catch {
    return null
  }
}

function normalizeShipment(input: Shipment): Shipment {
  const carrier = typeof input.carrier === 'string' ? input.carrier.trim().replace(/\s+/g, ' ') : ''
  const trackingNumber = typeof input.trackingNumber === 'string' ? input.trackingNumber.trim().toUpperCase() : ''
  if (!/^[A-Za-z0-9][ A-Za-z0-9._&+()/-]{0,79}$/.test(carrier) || !/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(trackingNumber)) {
    throw new ShipmentInputError('Enter a valid carrier name and tracking number.')
  }
  const trackingUrl = verifiedTrackingUrl(input.trackingUrl)
  return { carrier, trackingNumber, ...(trackingUrl ? { trackingUrl } : {}) }
}

async function shipmentStatements(env: FulfillmentEnv, job: ShipmentJob, input: Shipment, link: string | undefined): Promise<D1PreparedStatement[]> {
  const { carrier, trackingNumber, trackingUrl } = input
  const id = await keyFor([job.id, trackingNumber])
  const now = new Date().toISOString()
  return [
    env.DB.prepare(`INSERT INTO shipments (id, job_id, carrier, tracking_number, tracking_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET tracking_url = COALESCE(shipments.tracking_url, excluded.tracking_url)`)
      .bind(id, job.id, carrier, trackingNumber, trackingUrl ?? null, now),
    audit(env, `shipped-${id}`, job.id, 'shipment_recorded', JSON.stringify({ carrier, trackingNumber }), now),
    emailStatement(env, now, {
      id: `shipment-${id}`, orderId: job.order_id, kind: 'shipment', to: job.email,
      subject: 'A shipment from Crest & Carat is on its way', heading: 'Your shipment is on its way',
      paragraphs: [`A shipment from order ${job.order_reference} has been recorded.`, `Carrier: ${carrier}. Tracking number: ${trackingNumber}.`],
      link,
    }),
  ]
}

function markShipped(env: FulfillmentEnv, jobId: string, now: string): D1PreparedStatement {
  return env.DB.prepare(`UPDATE fulfillment_jobs SET status = 'shipped', updated_at = ?,
    lease_token = CASE WHEN status = 'manual' THEN NULL ELSE lease_token END
    WHERE id = ? AND status IN ('manual', 'submitted', 'shipped')`).bind(now, jobId)
}

export async function recordShipment(env: FulfillmentEnv, input: ShipmentInput): Promise<void> {
  if (typeof input.merchantReference !== 'string' || !/^CC-[A-F0-9]{32}$/.test(input.merchantReference)) {
    throw new ShipmentInputError('Enter a valid fulfillment reference.')
  }
  if (input.trackingUrl !== undefined && !verifiedTrackingUrl(input.trackingUrl)) {
    throw new ShipmentInputError('Enter a supported carrier HTTPS tracking link.')
  }
  const shipment = normalizeShipment(input)
  const job = await env.DB.prepare(`SELECT j.*, o.order_reference, o.email
    FROM fulfillment_jobs j INNER JOIN orders o ON o.id = j.order_id
    WHERE j.merchant_reference = ? AND o.status = 'paid' AND j.status IN ('manual', 'submitted', 'shipped')`)
    .bind(input.merchantReference).first<ShipmentJob>()
  if (!job) throw new ShipmentInputError('Fulfillment reference was not found for a paid order.', 404)
  const statements = await shipmentStatements(env, job, shipment, await privateOrderLink(env, job.order_reference))
  await env.DB.batch([...statements, markShipped(env, job.id, new Date().toISOString())])
}

async function discoverShipments(env: FulfillmentEnv, job: Job, lease: string, adapter: SupplierAdapter | undefined): Promise<void> {
  const finish = async (nextAttemptAt: string | null, issue: string | null, statements: D1PreparedStatement[] = []): Promise<void> => {
    const now = new Date().toISOString()
    await env.DB.batch([
      ...statements,
      audit(env, `${job.id}-${lease}-tracking`, job.id, issue ? 'tracking_retry' : 'tracking_lookup_completed', issue, now, lease),
      env.DB.prepare(`UPDATE fulfillment_jobs SET next_attempt_at = ?, updated_at = ?, lease_token = NULL, last_error = ?
        WHERE id = ? AND lease_token = ?`).bind(nextAttemptAt, now, issue, job.id, lease),
    ])
  }
  if (job.status === 'shipped' && Date.now() - Date.parse(job.created_at) > 90 * 24 * hour) {
    await finish(null, null)
    return
  }
  const order = await env.DB.prepare(`SELECT id, order_reference, email, address_json, created_at FROM orders
    WHERE id = ? AND status = 'paid'`).bind(job.order_id).first<PaidOrder>()
  if (!order || !adapter || !job.supplier_reference) {
    await finish(later(24 * hour), 'tracking_integration_unavailable')
    return
  }
  let supplied: Shipment[]
  try {
    supplied = await adapter.shipments(job.merchant_reference, job.supplier_reference)
  } catch (error) {
    await finish(later(6 * hour), supplierProblem(error))
    return
  }
  const normalized = new Map<string, Shipment>()
  let invalid = false
  for (const shipment of supplied) {
    try {
      const parcel = normalizeShipment(shipment)
      if (!normalized.has(parcel.trackingNumber) || parcel.trackingUrl) normalized.set(parcel.trackingNumber, parcel)
    } catch (error) {
      if (!(error instanceof ShipmentInputError)) throw error
      invalid = true
    }
  }
  const pending: Shipment[] = []
  if (normalized.size) {
    const { results } = await env.DB.prepare('SELECT tracking_number, tracking_url FROM shipments WHERE job_id = ?')
      .bind(job.id).all<{ tracking_number: string; tracking_url: string | null }>()
    const existing = new Map(results.map(({ tracking_number, tracking_url }) => [tracking_number, tracking_url]))
    for (const parcel of normalized.values()) {
      if (!existing.has(parcel.trackingNumber) || (parcel.trackingUrl && !existing.get(parcel.trackingNumber))) pending.push(parcel)
    }
  }
  const statements: D1PreparedStatement[] = []
  if (pending.length) {
    const shipmentJob = { ...job, email: order.email, order_reference: order.order_reference }
    const link = await privateOrderLink(env, order.order_reference)
    const parcels = await Promise.all(pending.slice(0, 3).map((parcel) => shipmentStatements(env, shipmentJob, parcel, link)))
    statements.push(...parcels.flat(), markShipped(env, job.id, new Date().toISOString()))
  }
  const delay = pending.length > 3 ? 5 * minute : job.status === 'shipped' ? 24 * hour : 6 * hour
  await finish(later(delay), invalid ? 'supplier_tracking_unrecognized' : null, statements)
}

function supplierProblem(error: unknown): string {
  return error instanceof SupplierError ? error.code : 'supplier_request_outcome_unconfirmed'
}

function manualSupplierReason(reference: string): string {
  return `Confirm supplier order ${reference} and its line details directly with the supplier before taking further action`
}

async function processJob(env: FulfillmentEnv, job: Job, adapter: SupplierAdapter | undefined): Promise<void> {
  const now = new Date().toISOString()
  const lease = crypto.randomUUID()
  const tracking = job.status === 'submitted' || job.status === 'shipped'
  const transitionStatus = tracking ? job.status : job.status === 'queued' ? 'submitting' : 'reconciling'
  const [claimed] = await env.DB.batch([
    env.DB.prepare(`UPDATE fulfillment_jobs SET status = ?, lease_token = ?, next_attempt_at = ?, updated_at = ?,
      attempts = attempts + ?
      WHERE id = ? AND status = ? AND next_attempt_at = ? AND next_attempt_at <= ?
      AND EXISTS (SELECT 1 FROM orders WHERE id = fulfillment_jobs.order_id AND status = 'paid')`)
      .bind(transitionStatus, lease, later(5 * minute), now, tracking ? 0 : 1, job.id, job.status, job.next_attempt_at, now),
    audit(env, `${job.id}-${lease}-claimed`, job.id, tracking ? 'tracking_lookup' : transitionStatus, null, now, lease),
  ])
  if (claimed?.meta.changes !== 1) return
  if (tracking) {
    await discoverShipments(env, job, lease, adapter)
    return
  }

  const order = await env.DB.prepare(`SELECT id, order_reference, email, address_json, created_at FROM orders
    WHERE id = ? AND status = 'paid'`).bind(job.order_id).first<PaidOrder>()
  if (!order) throw new Error('Paid order is unavailable')
  const items = await jobItems(env, job.id)
  if (job.status === 'queued') {
    const address = shippingAddress(order.address_json)
    if (!adapter || !address || !items.length || items.some((item) => !adapter.canSubmit(item, address))) {
      await moveToManual(env, job, lease, order, items, 'Automatic purchasing is unavailable for these items or this destination')
      return
    }
    let reference: string
    try {
      reference = await adapter.submit({ address, items, merchantReference: job.merchant_reference, createdAt: order.created_at })
    } catch (error) {
      if (error instanceof SupplierError && error.manualReference) {
        await moveToManual(env, job, lease, order, items, manualSupplierReason(error.manualReference), error.manualReference)
        return
      }
      await transition(env, job, lease, 'reconciling', supplierProblem(error), later(10 * minute), null)
      return
    }
    await recordDispatch(env, job, lease, order, items, adapter, reference)
    return
  }

  let reference: string | null = null
  let issue = 'supplier_purchase_order_not_found'
  if (adapter) {
    try {
      reference = await adapter.find(job.merchant_reference)
    } catch (error) {
      if (error instanceof SupplierError && error.manualReference) {
        await moveToManual(env, job, lease, order, items, manualSupplierReason(error.manualReference), error.manualReference)
        return
      }
      issue = supplierProblem(error)
    }
  } else {
    issue = 'supplier_integration_unavailable_for_reconciliation'
  }
  if (reference && adapter) {
    await recordDispatch(env, job, lease, order, items, adapter, reference)
  } else if (job.attempts >= 5) {
    await moveToManual(env, job, lease, order, items, `Check the purchase order directly with the supplier before placing an order. Last check: ${issue}`)
  } else {
    const delay = Math.min(10 * 2 ** job.attempts, 60) * minute
    await transition(env, job, lease, 'reconciling', issue, later(delay), null)
  }
}

export async function sweepFulfillment(env: FulfillmentEnv): Promise<void> {
  const adapters = supplierAdapters(env, senderAddress(env))
  const { results: orders } = await env.DB.prepare(`SELECT id, order_reference, email, address_json, created_at FROM orders
    WHERE status = 'paid' AND NOT EXISTS (SELECT 1 FROM fulfillment_jobs WHERE order_id = orders.id)
    ORDER BY paid_at, id LIMIT 3`).all<PaidOrder>()
  const enqueueResults = await Promise.allSettled(orders.map((order) => enqueueOrder(env, order, adapters)))

  const { results: jobs } = await env.DB.prepare(`SELECT id, order_id, supplier, merchant_reference, supplier_reference, status,
     attempts, next_attempt_at, created_at
    FROM fulfillment_jobs WHERE status <> 'manual' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, id LIMIT 3`).bind(new Date().toISOString()).all<Job>()
  const jobResults = await Promise.allSettled(jobs.map((job) => processJob(env, job, adapters.get(job.supplier))))
  await sendQueuedEmails(env)
  if ([...enqueueResults, ...jobResults].some((result) => result.status === 'rejected')) {
    throw new Error('One or more fulfillment tasks require retry')
  }
}
