import { apiRequest, record, secureHostedUrl } from './http';

export interface BagLine {
  sku: string;
  quantity: number;
  engraving: string;
}

interface PublicItem {
  sku: string;
  productSlug: string;
  variantId: string;
  name: string;
  variantName: string;
  priceCents: number;
}

export interface CatalogItem extends PublicItem {
  engraving: { minLength: number; maxLength: number; pattern: string | null; required: boolean; instructions: string; uppercaseOnly: boolean };
  maxQuantity: number;
  destinations: string[];
}

export interface Catalog {
  items: CatalogItem[];
  shipping: { country: string; region: string; label: string }[];
  termsVersion: string | null;
  processors: { id: string; label: string }[];
}

export interface Address {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface QuoteInput {
  items: readonly BagLine[];
  address: Address;
  processor: string;
}

interface Quote {
  currency: 'USD';
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingLabel: string;
  taxDisclosure: string;
  termsVersion: string;
  items: (PublicItem & BagLine)[];
}

export interface QuoteResult {
  quote: Quote;
  quoteToken: string;
}

export interface OrderInput extends QuoteInput {
  email: string;
  marketingOptIn: boolean;
  termsVersion: string;
  termsAccepted: true;
  requestId: string;
  quoteToken: string;
}

export interface OrderResult {
  orderReference: string;
  trackingToken: string;
  status: string;
  checkoutUrl: string | null;
  checkoutState: 'new' | 'creating' | 'ready' | 'uncertain';
}

export interface TrackingInput {
  orderReference: string;
  token: string;
}

export interface TrackingResult {
  orderReference: string;
  status: string;
  shipments: { carrier: string; trackingNumber: string; shippedAt: string }[];
  checkoutUrl: string | null;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPublicItem(value: unknown): value is PublicItem {
  return record(value) && typeof value.sku === 'string' && typeof value.productSlug === 'string' && typeof value.variantId === 'string'
    && typeof value.name === 'string' && typeof value.variantName === 'string' && nonNegativeInteger(value.priceCents);
}

function isCatalogItem(value: unknown): value is CatalogItem {
  if (!record(value) || !isPublicItem(value) || !record(value.engraving)) return false;
  const { engraving } = value;
  return nonNegativeInteger(value.maxQuantity) && value.maxQuantity > 0 && value.maxQuantity <= 20
    && nonNegativeInteger(engraving.minLength) && nonNegativeInteger(engraving.maxLength)
    && engraving.maxLength >= engraving.minLength && engraving.maxLength <= 160 && typeof engraving.required === 'boolean'
    && typeof engraving.instructions === 'string' && typeof engraving.uppercaseOnly === 'boolean'
    && (engraving.pattern === null || typeof engraving.pattern === 'string')
    && Array.isArray(value.destinations) && value.destinations.every((country: unknown) => typeof country === 'string');
}

function isShipping(value: unknown): value is Catalog['shipping'][number] {
  return record(value) && typeof value.country === 'string' && typeof value.region === 'string' && typeof value.label === 'string';
}

function isProcessor(value: unknown): value is Catalog['processors'][number] {
  return record(value) && typeof value.id === 'string' && typeof value.label === 'string';
}

function isQuotedItem(value: unknown): value is Quote['items'][number] {
  return record(value) && isPublicItem(value) && nonNegativeInteger(value.quantity) && value.quantity > 0 && typeof value.engraving === 'string';
}

function isQuote(value: unknown): value is Quote {
  return record(value) && value.currency === 'USD' && nonNegativeInteger(value.subtotalCents)
    && nonNegativeInteger(value.shippingCents) && nonNegativeInteger(value.taxCents) && nonNegativeInteger(value.totalCents)
    && value.totalCents === value.subtotalCents + value.shippingCents + value.taxCents
    && typeof value.shippingLabel === 'string' && typeof value.taxDisclosure === 'string' && typeof value.termsVersion === 'string'
    && Array.isArray(value.items) && value.items.length > 0 && value.items.every(isQuotedItem)
    && value.subtotalCents === value.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

function isOrderResult(value: unknown): value is OrderResult {
  return record(value) && typeof value.orderReference === 'string' && typeof value.trackingToken === 'string'
    && typeof value.status === 'string' && (value.checkoutUrl === null || typeof value.checkoutUrl === 'string')
    && (value.checkoutState === 'new' || value.checkoutState === 'creating' || value.checkoutState === 'ready' || value.checkoutState === 'uncertain');
}

function isShipment(value: unknown): value is TrackingResult['shipments'][number] {
  return record(value) && typeof value.carrier === 'string' && typeof value.trackingNumber === 'string' && typeof value.shippedAt === 'string';
}

export async function loadCatalog(signal: AbortSignal): Promise<Catalog> {
  const data = await apiRequest('/api/catalog', undefined, signal);
  if (!record(data) || !Array.isArray(data.items) || !data.items.every(isCatalogItem)
    || !Array.isArray(data.shipping) || !data.shipping.every(isShipping)
    || !Array.isArray(data.processors) || !data.processors.every(isProcessor)
    || (typeof data.termsVersion !== 'string' && data.termsVersion !== null)) throw new Error('Invalid catalog response.');
  return { items: data.items, shipping: data.shipping, processors: data.processors, termsVersion: data.termsVersion };
}

export async function requestQuote(input: QuoteInput, signal: AbortSignal): Promise<QuoteResult> {
  const data = await apiRequest('/api/quote', input, signal);
  if (!record(data) || !isQuote(data.quote) || typeof data.quoteToken !== 'string' || !data.quoteToken) {
    throw new Error('Invalid quote response.');
  }
  return { quote: data.quote, quoteToken: data.quoteToken };
}

export async function createOrder(input: OrderInput, signal: AbortSignal): Promise<OrderResult> {
  const data = await apiRequest('/api/orders', input, signal);
  if (!isOrderResult(data)) throw new Error('Invalid order response.');
  return { ...data, checkoutUrl: data.checkoutUrl ? secureHostedUrl(data.checkoutUrl) ?? null : null };
}

export async function trackOrder(input: TrackingInput, signal: AbortSignal): Promise<TrackingResult> {
  const data = await apiRequest('/api/track', input, signal);
  if (!record(data) || typeof data.orderReference !== 'string' || typeof data.status !== 'string'
    || !Array.isArray(data.shipments) || !data.shipments.every(isShipment)) throw new Error('Invalid tracking response.');
  const checkoutUrl = (data.status === 'pending' || data.status === 'partial') && typeof data.checkoutUrl === 'string'
    ? secureHostedUrl(data.checkoutUrl) ?? null : null;
  return { orderReference: data.orderReference, status: data.status, shipments: data.shipments, checkoutUrl };
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatUsd = (cents: number): string => money.format(cents / 100);

export function engravingIssue(engraving: string, rule: CatalogItem['engraving']): string | undefined {
  if (!engraving) return rule.required ? 'Enter the engraving for this piece.' : undefined;
  if (!rule.maxLength) return 'This option does not support engraving.';
  const length = Array.from(engraving).length;
  if (length < rule.minLength || length > rule.maxLength) {
    return `Enter ${rule.minLength}–${rule.maxLength} characters for this option.`;
  }
  if (!engraving.trim()) return 'Enter at least one visible character.';
  if (rule.uppercaseOnly && engraving !== engraving.toUpperCase()) return 'Enter this engraving in capital letters.';
  if (rule.pattern) {
    try {
      if (!new RegExp(`^(?:${rule.pattern})$`, 'u').test(engraving)) {
        return rule.instructions || 'Use the supported engraving characters shown below.';
      }
    } catch {
      return 'Contact the concierge to confirm engraving options.';
    }
  }
}
