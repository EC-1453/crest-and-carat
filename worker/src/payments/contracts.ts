export type ProcessorName = 'mercury' | 'helcim' | 'stripe' | 'airwallex' | 'nickel' | 'relay'
export type PaymentStatus = 'pending' | 'partial' | 'payment_review' | 'paid'
export type CheckoutState = 'new' | 'creating' | 'ready' | 'uncertain'

export interface PaymentEnv {
  DB: D1Database
  ENVIRONMENT: 'test' | 'production'
  STOREFRONT_ORIGIN: string
  MERCURY_ENABLED?: string
  MERCURY_EGRESS_APPROVED?: string
  MERCURY_TRANSFER_APPROVED?: string
  MERCURY_ACH_DEBIT_ENABLED?: string
  MERCURY_API_TOKEN?: string
  MERCURY_ACCOUNT_ID?: string
  MERCURY_WEBHOOK_SECRET?: string
  HELCIM_ENABLED?: string
  HELCIM_API_TOKEN?: string
  HELCIM_HOSTED_ORIGIN?: string
  HELCIM_WEBHOOK_SECRET?: string
  HELCIM_ACH_ENABLED?: string
  STRIPE_ENABLED?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  AIRWALLEX_ENABLED?: string
  AIRWALLEX_CLIENT_ID?: string
  AIRWALLEX_API_KEY?: string
  AIRWALLEX_ACCOUNT_ID?: string
  AIRWALLEX_WEBHOOK_SECRET?: string
  NICKEL_ENABLED?: string
  RELAY_ENABLED?: string
  RELAY_BRIDGE_URL?: string
  RELAY_BRIDGE_TOKEN?: string
  RELAY_HOSTED_ORIGIN?: string
}

export interface StoredPaymentOrder {
  id: string
  order_reference: string
  email: string
  address_json: string
  processor: ProcessorName
  status: PaymentStatus
  currency: 'USD'
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  provider_payment_id: string | null
  received_cents: number
  checkout_state: CheckoutState
  checkout_claimed_at: string | null
  last_payment_check_at: string | null
  created_at: string
}

export interface GatewayOrder {
  id: string
  reference: string
  email: string
  buyerName: string
  currency: 'USD'
  totalCents: number
  subtotalCents: number
  shippingCents: number
  taxCents: number
  createdAt: string
  checkoutClaimedAt: string | null
  shippingAddress: {
    line1: string
    line2: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

export interface HostedCheckout {
  providerId: string
  url: string
}

export interface PaymentObservation {
  status: PaymentStatus
  receivedCents: number
  detail: string
  appliedTransactionIds?: ReadonlySet<string>
}

export interface WebhookHint {
  eventKey: string
  providerId?: string
  transactionId?: string
}

export interface PaymentGateway {
  readonly label: string
  create(order: GatewayOrder, returnUrl: string): Promise<HostedCheckout>
  recover(order: GatewayOrder): Promise<HostedCheckout | null>
  reconcile(order: GatewayOrder, providerId: string): Promise<PaymentObservation>
  authenticate?(headers: Headers, raw: string): Promise<WebhookHint | null | false>
  resolveReference?(transactionId: string): Promise<string | null>
  findUnapplied?(transactionId: string): Promise<{ reference: string, amount: number } | null>
}
