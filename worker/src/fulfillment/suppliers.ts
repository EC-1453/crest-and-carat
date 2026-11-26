export interface SupplierEnv {
  ENVIRONMENT: 'test' | 'production'
  STULLER_ENABLED?: string
  STULLER_PACK_AND_SHIP_APPROVED?: string
  STULLER_USERNAME?: string
  STULLER_PASSWORD?: string
  STULLER_ACCOUNT?: string
  STULLER_ORDER_TYPE?: string
  STULLER_PAYMENT_TYPE?: string
  STULLER_SHIP_METHOD_US?: string
  STULLER_SHIP_METHOD_INTERNATIONAL?: string
  STULLER_APPROVED_COUNTRIES?: string
  STULLER_ENGRAVING_OPTIONS_JSON?: string
  STULLER_DISPATCH_EMAIL?: string
}

export interface ShippingAddress {
  fullName: string
  line1: string
  line2?: string | null
  city: string
  region: string
  postalCode: string
  country: string
  phone?: string | null
}

export interface FulfillmentItem {
  line_number: number
  sku: string
  name: string
  variant_name: string
  quantity: number
  engraving: string | null
  supplier_id: string
  supplier_sku: string | null
  supplier_api_approved: number
}

export interface SupplierOrder {
  merchantReference: string
  createdAt: string
  address: ShippingAddress
  items: FulfillmentItem[]
}

export interface Shipment {
  carrier: string
  trackingNumber: string
  trackingUrl?: string
}

export interface SupplierAdapter {
  id: string
  dispatchEmail?: string
  canSubmit(item: FulfillmentItem, address: ShippingAddress): boolean
  submit(order: SupplierOrder): Promise<string>
  find(merchantReference: string): Promise<string | null>
  shipments(merchantReference: string, supplierReference: string): Promise<Shipment[]>
}

interface EngravingOptions {
  location: number
  lineLocation: number
  type: string
  font: string
  size?: string
  fillOption?: string
  fillColor?: string
  finish?: string
}

export class SupplierError extends Error {
  constructor(readonly code: string, readonly manualReference?: string) {
    super(code)
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function supplierReference(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : undefined
}

function engravingMap(raw: string | undefined): Map<string, EngravingOptions> {
  const options = new Map<string, EngravingOptions>()
  if (!raw) return options
  let settings: Record<string, unknown> | null
  try {
    settings = object(JSON.parse(raw))
  } catch {
    return options
  }
  if (!settings) return options
  for (const [sku, entry] of Object.entries(settings)) {
    const value = object(entry)
    const type = text(value?.type)
    const font = text(value?.font)
    const location = value?.location
    const lineLocation = value?.lineLocation
    if (!type || !font || typeof location !== 'number' || !Number.isSafeInteger(location) || location < 1
      || typeof lineLocation !== 'number' || !Number.isSafeInteger(lineLocation) || lineLocation < 1) continue
    const size = text(value?.size)
    const fillOption = text(value?.fillOption)
    const fillColor = text(value?.fillColor)
    const finish = text(value?.finish)
    options.set(sku, {
      location, lineLocation, type, font,
      ...(size ? { size } : {}),
      ...(fillOption ? { fillOption } : {}),
      ...(fillColor ? { fillColor } : {}),
      ...(finish ? { finish } : {}),
    })
  }
  return options
}

function packAndShipAdapter(env: SupplierEnv, contactEmail: string): SupplierAdapter | null {
  const {
    STULLER_ACCOUNT: account,
    STULLER_USERNAME: username,
    STULLER_PASSWORD: password,
    STULLER_ORDER_TYPE: orderType,
    STULLER_PAYMENT_TYPE: paymentType,
    STULLER_SHIP_METHOD_US: domesticMethod,
    STULLER_SHIP_METHOD_INTERNATIONAL: internationalMethod,
    STULLER_DISPATCH_EMAIL: dispatchEmail,
  } = env
  if (env.ENVIRONMENT !== 'production' || env.STULLER_ENABLED !== 'true'
    || env.STULLER_PACK_AND_SHIP_APPROVED !== 'true' || !text(account) || !text(username)
    || !text(password) || !text(orderType) || !text(paymentType) || !contactEmail) return null
  const credentials = new TextEncoder().encode(`${username}:${password}`)
  const authorization = `Basic ${btoa(Array.from(credentials, (byte) => String.fromCharCode(byte)).join(''))}`
  const approvedCountries = new Set((env.STULLER_APPROVED_COUNTRIES ?? '').split(',').map((country) => country.trim().toUpperCase()))
  const engravings = engravingMap(env.STULLER_ENGRAVING_OPTIONS_JSON)

  const shippingMethod = (country: string): string | undefined => country === 'US' ? text(domesticMethod) : text(internationalMethod)
  const canSubmit = (item: FulfillmentItem, address: ShippingAddress): boolean =>
    item.supplier_id === 'stuller' && item.supplier_api_approved === 1 && Boolean(text(item.supplier_sku))
    && approvedCountries.has(address.country) && Boolean(shippingMethod(address.country))
    && (!item.engraving || engravings.has(item.supplier_sku ?? ''))

  async function request(path: 'orders' | 'orders/submitorder' | 'invoice', payload: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`https://api.stuller.com/api/v2/${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new SupplierError(`stuller_http_${response.status}`)
    const body = object(await response.json())
    if (!body) throw new SupplierError('stuller_unrecognized_response')
    return body
  }

  return {
    id: 'stuller',
    ...(text(dispatchEmail) ? { dispatchEmail } : {}),
    canSubmit,
    async submit(order) {
      const { address, items, merchantReference } = order
      if (!items.length || items.some((item) => !canSubmit(item, address))) {
        throw new SupplierError('stuller_items_require_manual_review')
      }
      const shipMethod = shippingMethod(address.country)
      const lines = items.map((item) => {
        const option = item.engraving ? engravings.get(item.supplier_sku ?? '') : undefined
        const customization = option ? {
          Engravings: [{
            Location: option.location,
            EngravingType: option.type,
            FontType: option.font,
            FontSize: option.size,
            FillOption: option.fillOption,
            FillColor: option.fillColor,
            SpecialFinish: option.finish,
            EngravingLine: [{ LineLocation: option.lineLocation, Text: item.engraving }],
          }],
        } : {}
        return {
          Item: item.supplier_sku,
          Items: [{ Number: item.supplier_sku, ...customization }],
          Quantity: item.quantity,
          CustomerLineReference: String(item.line_number),
        }
      })
      const body = await request('orders/submitorder', {
        Account: account,
        Type: orderType,
        Version: 2,
        TestMode: false,
        OrderID: merchantReference,
        PurchaseOrderNumber: merchantReference,
        CustomerData: { OrderNumber: merchantReference, OrderDate: order.createdAt },
        Contact: { Name: 'Crest & Carat', EmailAddress: contactEmail },
        Payment: { Type: paymentType },
        ShipToAddress: {
          Address: {
            Name: address.fullName,
            AddressLine1: address.line1,
            AddressLine2: address.line2 || undefined,
            City: address.city,
            State: address.country === 'US' ? address.region : undefined,
            Province: address.country === 'US' ? undefined : address.region,
            PostalCode: address.postalCode,
            Country: address.country,
            Phone: address.phone || undefined,
          },
          ShipComplete: true,
          ShipMethodType: shipMethod,
          RemovePricing: true,
          SignatureRequired: true,
        },
        IfOosType: 'Call',
        Lines: lines,
      })
      const confirmation = supplierReference(body.ConfirmationNumber)
      if (body.Created === true && confirmation && (!Array.isArray(body.Errors) || !body.Errors.length)) return confirmation
      if (confirmation) throw new SupplierError('stuller_submission_requires_manual_review', confirmation)
      throw new SupplierError('stuller_submission_unconfirmed')
    },
    async find(merchantReference) {
      const body = await request('orders', { PurchaseOrderNumber: [merchantReference] })
      if (!Array.isArray(body.OrderStatuses)) throw new SupplierError('stuller_unrecognized_order_status')
      const matches = body.OrderStatuses.flatMap((entry) => {
        const row = object(entry)
        if (row?.PurchaseOrderNumber !== merchantReference) return []
        const reference = supplierReference(row?.OrderNumber)
        if (!reference) throw new SupplierError('stuller_unrecognized_order_reference')
        const status = text(row.Status)?.trim().toLowerCase() ?? ''
        return [{ reference, status }]
      })
      const references = new Set(matches.map((match) => match.reference))
      if (references.size > 1) throw new SupplierError('stuller_multiple_supplier_orders')
      const rejected = matches.find(({ status }) => /^(canceled|cancelled|rejected|voided?|failed)$/.test(status))
      if (rejected) throw new SupplierError('stuller_order_requires_manual_review', rejected.reference)
      return matches[0]?.reference ?? null
    },
    async shipments(merchantReference, reference) {
      const body = await request('invoice', { PurchaseOrderNumber: [merchantReference] })
      if (!Array.isArray(body.Invoices)) throw new SupplierError('stuller_unrecognized_invoice')
      return body.Invoices.flatMap((entry) => {
        const row = object(entry)
        const orderMatches = row?.PurchaseOrderNumber === merchantReference || (
          !row?.PurchaseOrderNumber && supplierReference(row?.OrderNumber) === reference
        )
        const trackingNumber = text(row?.TrackingNumber)
        if (!orderMatches || !trackingNumber) return []
        const trackingUrl = text(row?.TrackingLink)
        return [{
          carrier: text(row?.ShipMethod) ?? 'Carrier',
          trackingNumber,
          ...(trackingUrl ? { trackingUrl } : {}),
        }]
      })
    },
  }
}

export function supplierAdapters(env: SupplierEnv, contactEmail: string): Map<string, SupplierAdapter> {
  const adapters = new Map<string, SupplierAdapter>()
  const stuller = packAndShipAdapter(env, contactEmail)
  if (stuller) adapters.set(stuller.id, stuller)
  return adapters
}
