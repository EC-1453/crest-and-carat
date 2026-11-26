import { calculateQuote, type Address, type CartItem } from './catalog';
import { paymentProcessors, startCheckout, type PaymentEnv } from './payments';
import {
  ApiError, createQuoteToken, hasSigningSecret, isOrderReference, isRequestId, parseEmail, readJson, requestSignature,
  secretsEqual, trackingLink, trackingToken, validQuoteToken, type SecurityEnv,
} from './security';
import { insertSubscriber } from './subscribers';

interface OrderEnv extends SecurityEnv, PaymentEnv {}

interface OrderRow {
  id: string;
  order_reference: string;
  request_hash: string;
  processor: string;
  status: string;
  checkout_url: string | null;
  checkout_state: string;
}

function addressField(value: unknown, label: string, maximum: number, required = true): string {
  if (value === undefined && !required) return '';
  if (typeof value === 'string') {
    const field = value.trim();
    if ((!required || field.length > 0) && field.length <= maximum && !/[\u0000-\u001F\u007F]/u.test(field)) return field;
  }
  throw new ApiError(`Check the ${label} in your delivery address.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function orderInput(body: Record<string, unknown>) {
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20) {
    throw new ApiError('Choose between 1 and 20 bag lines.');
  }
  const items: CartItem[] = body.items.map((line: unknown) => {
    if (!isRecord(line) || typeof line.sku !== 'string' || line.sku.length < 1 || line.sku.length > 96 ||
        typeof line.quantity !== 'number' || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100 ||
        typeof line.engraving !== 'string' || line.engraving.length > 512) {
      throw new ApiError('Check the piece, quantity and engraving for each bag line.');
    }
    return { sku: line.sku, quantity: line.quantity, engraving: line.engraving };
  });
  if (!isRecord(body.address)) throw new ApiError('Enter a delivery address.');
  const country = addressField(body.address.country, 'country', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new ApiError('Choose a valid delivery country.');
  const state = addressField(body.address.state, 'state or province', 80, country === 'US');
  const address: Address = {
    fullName: addressField(body.address.fullName, 'recipient name', 100),
    line1: addressField(body.address.line1, 'street address', 160),
    line2: addressField(body.address.line2, 'second address line', 160, false),
    city: addressField(body.address.city, 'city', 80),
    state: country === 'US' ? state.toUpperCase() : state,
    postalCode: addressField(body.address.postalCode, 'postal code', 24, country === 'US'),
    country,
  };
  if (country === 'US' && (!/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(?:-\d{4})?$/.test(address.postalCode))) {
    throw new ApiError('Enter a two-letter US state and a valid ZIP code.');
  }
  if (typeof body.processor !== 'string' || !/^[a-z][a-z0-9_-]{1,30}$/.test(body.processor)) {
    throw new ApiError('Choose a payment method.');
  }
  return { items, address, processor: body.processor };
}

function requireCheckout(env: OrderEnv, processor: string) {
  if (!hasSigningSecret(env) || !paymentProcessors(env).some(({ id }) => id === processor)) {
    throw new ApiError('This payment method is currently unavailable.', 503);
  }
}

export async function quoteOrder(env: OrderEnv, request: Request) {
  const input = orderInput(await readJson(request, 32_768));
  requireCheckout(env, input.processor);
  const quote = await calculateQuote(env.DB, input.items, input.address);
  const quoteToken = await createQuoteToken(env, { input, quote });
  return {
    quote: {
      ...quote,
      items: quote.items.map(({ sku, productSlug, variantId, name, variantName, priceCents, quantity, engraving }) =>
        ({ sku, productSlug, variantId, name, variantName, priceCents, quantity, engraving })),
    },
    quoteToken,
  };
}

function findOrder(db: D1Database, requestId: string) {
  return db.prepare(`
    SELECT id, order_reference, request_hash, processor, status, checkout_url, checkout_state
    FROM orders WHERE request_id = ?
  `).bind(requestId).first<OrderRow>();
}

export async function createOrder(env: OrderEnv, request: Request) {
  const body = await readJson(request, 32_768);
  const input = orderInput(body);
  const email = parseEmail(body.email);
  if (!email || !isRequestId(body.requestId) || typeof body.marketingOptIn !== 'boolean' ||
      body.termsAccepted !== true || typeof body.termsVersion !== 'string' || body.termsVersion.length > 100) {
    throw new ApiError('Enter your email and accept the current order terms.');
  }
  if (!hasSigningSecret(env)) throw new ApiError('Checkout is currently unavailable.', 503);

  const requestId = body.requestId.toLowerCase();
  const requestHash = await requestSignature(env, { input, email, termsVersion: body.termsVersion, marketingOptIn: body.marketingOptIn });
  let order = await findOrder(env.DB, requestId);
  if (!order) {
    requireCheckout(env, input.processor);
    const quote = await calculateQuote(env.DB, input.items, input.address);
    if (quote.termsVersion !== body.termsVersion || typeof body.quoteToken !== 'string' ||
        !(await validQuoteToken(env, body.quoteToken, { input, quote }))) {
      throw new ApiError('Your quote or order terms changed or expired. Review the updated total before continuing.', 409);
    }
    const orderId = crypto.randomUUID();
    const orderReference = `CC-${crypto.randomUUID().toUpperCase()}`;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO orders (
          id, order_reference, request_id, request_hash, email, address_json, processor, currency,
          subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_region, shipping_label,
          tax_disclosure, terms_version, terms_accepted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (request_id) DO NOTHING
      `).bind(orderId, orderReference, requestId, requestHash, email, JSON.stringify(input.address), input.processor,
        quote.currency, quote.subtotalCents, quote.shippingCents, quote.taxCents, quote.totalCents, quote.shippingRegion,
        quote.shippingLabel, quote.taxDisclosure, quote.termsVersion, now, now, now),
      ...quote.items.map((line, index) => env.DB.prepare(`
        INSERT INTO order_items (
          order_id, line_number, sku, product_slug, variant_id, name, variant_name, unit_price_cents,
          quantity, engraving, supplier_id, supplier_sku, supplier_api_approved
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM orders WHERE id = ?
      `).bind(orderId, index + 1, line.sku, line.productSlug, line.variantId, line.name, line.variantName,
        line.priceCents, line.quantity, line.engraving, line.supplierId, line.supplierSku, Number(line.supplierApiApproved), orderId)),
      insertSubscriber(env.DB, {
        requestId: `buyer:${orderId}`, source: 'buyer', email, fullName: input.address.fullName,
        sourcePage: '/bag/', interestCategory: quote.items[0]?.productSlug ?? null, message: null,
        marketingOptIn: body.marketingOptIn, timestamp: now,
      }, orderId),
    ]);
    order = await findOrder(env.DB, requestId);
  }
  if (!order || !(await secretsEqual(order.request_hash, requestHash))) {
    throw new ApiError('This checkout request has already been used for different order details.', 409);
  }
  if (order.status === 'pending' && order.checkout_state === 'new') {
    requireCheckout(env, order.processor);
    await startCheckout(env, order.id, await trackingLink(env, order.order_reference));
    order = (await findOrder(env.DB, requestId)) ?? order;
  }

  return {
    orderReference: order.order_reference,
    trackingToken: await trackingToken(env, order.order_reference),
    status: order.status,
    checkoutState: order.checkout_state,
    checkoutUrl: order.status === 'pending' && paymentProcessors(env).some(({ id }) => id === order.processor)
      ? order.checkout_url : null,
  };
}

export async function trackOrder(env: OrderEnv, request: Request) {
  if (!hasSigningSecret(env)) throw new ApiError('Order tracking is currently unavailable.', 503);
  const { orderReference, token } = await readJson(request, 2048);
  if (!isOrderReference(orderReference) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      !(await secretsEqual(token, await trackingToken(env, orderReference)))) {
    throw new ApiError('This private order link is invalid.', 404);
  }
  const order = await env.DB.prepare(`
    SELECT id, status, processor, checkout_url FROM orders WHERE order_reference = ?
  `).bind(orderReference).first<Pick<OrderRow, 'id' | 'status' | 'processor' | 'checkout_url'>>();
  if (!order) throw new ApiError('This private order link is invalid.', 404);
  const shipments = await env.DB.prepare(`
    SELECT s.carrier, s.tracking_number AS trackingNumber, s.created_at AS shippedAt
    FROM shipments s JOIN fulfillment_jobs j ON s.job_id = j.id
    WHERE j.order_id = ? ORDER BY s.created_at
  `).bind(order.id).all<{ carrier: string; trackingNumber: string; shippedAt: string }>();
  const canResume = (order.status === 'pending' || order.status === 'partial')
    && paymentProcessors(env).some(({ id }) => id === order.processor);
  return {
    orderReference, status: order.status, shipments: shipments.results,
    checkoutUrl: canResume ? order.checkout_url : null,
  };
}
