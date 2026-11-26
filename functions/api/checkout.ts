import type { EventContext } from '@cloudflare/workers-types';
import { getPurchasableOffer, products } from '../../src/catalog';
import { sourceProducts } from '../../src/catalog-source';
import { validateSelection, type CheckoutSelection } from '../../src/checkout-selection';

interface Environment {
  CHECKOUT_SESSION_WEBHOOK_URL?: string;
  CHECKOUT_SESSION_WEBHOOK_TOKEN?: string;
}

type Context = Pick<EventContext<Environment, never, Record<string, unknown>>, 'request' | 'env'>;

interface CheckoutRequest {
  requestId: string;
  productSlug: string;
  email: string;
  selection: CheckoutSelection;
}

const nativeOrigins = new Set(['https://localhost', 'capacitor://localhost']);
const bodyLimit = 8000;
const emailPattern = /^[^\s@\u0000-\u001F\u007F]+@[^\s@\u0000-\u001F\u007F]+\.[^\s@\u0000-\u001F\u007F]+$/u;

function reply(status: number, body: object | null, nativeOrigin: string | undefined): Response {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin' });
  if (body) headers.set('Content-Type', 'application/json; charset=utf-8');
  if (nativeOrigin) {
    headers.set('Access-Control-Allow-Origin', nativeOrigin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (status === 405) headers.set('Allow', 'POST, OPTIONS');
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

async function readInput(request: Context['request']): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > bodyLimit || !request.body) throw new Error('Invalid request body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > bodyLimit) {
        await reader.cancel();
        throw new Error('Invalid request body');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function parseInput(value: unknown): CheckoutRequest | undefined {
  if (typeof value !== 'object' || !value) return undefined;
  const { requestId, email, productSlug, selection, acknowledgedFinalSale } = value as Record<string, unknown>;
  if (typeof requestId !== 'string' || !/^[a-f0-9]{32}$/u.test(requestId)
    || typeof productSlug !== 'string' || !/^[a-z0-9-]{1,100}$/u.test(productSlug)
    || typeof email !== 'string' || email.length > 254 || !emailPattern.test(email.trim())
    || acknowledgedFinalSale !== true || !selection || typeof selection !== 'object') return undefined;
  const { sizeId, variantId, surfaceId, engraving, fontId, destination } = selection as Record<string, unknown>;
  if (typeof sizeId !== 'string' || typeof variantId !== 'string' || typeof surfaceId !== 'string' || typeof engraving !== 'string'
    || typeof fontId !== 'string' || typeof destination !== 'string') return undefined;
  return { requestId, productSlug, email: email.trim(), selection: { sizeId, variantId, surfaceId, engraving, fontId, destination } };
}

function httpsUrl(value: string | undefined): URL | undefined {
  if (!value || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  const origin = request.headers.get('Origin');
  const nativeOrigin = origin && nativeOrigins.has(origin) ? origin : undefined;
  if ((origin && origin !== new URL(request.url).origin && !nativeOrigin) || (!origin && request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
    return reply(403, { error: 'Forbidden' }, undefined);
  }
  if (request.method === 'OPTIONS') return reply(204, null, nativeOrigin);
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, nativeOrigin);
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return reply(415, { error: 'Expected JSON' }, nativeOrigin);
  }

  let input: CheckoutRequest | undefined;
  try {
    input = parseInput(await readInput(request));
  } catch {
    return reply(400, { error: 'Invalid order request' }, nativeOrigin);
  }
  if (!input) return reply(400, { error: 'Invalid order request' }, nativeOrigin);

  const product = products.find(({ slug }) => slug === input.productSlug);
  const offer = product && getPurchasableOffer(product);
  const sourceProduct = sourceProducts.find(({ slug }) => slug === input.productSlug);
  if (!offer || !sourceProduct?.supplier_sku || !sourceProduct.supplier_id) return reply(404, { error: 'Piece unavailable for checkout' }, nativeOrigin);
  const zone = offer.shipping.find(({ destinations }) => destinations.includes(input.selection.destination));
  if (!zone || Object.keys(validateSelection(offer, input.selection)).length) return reply(400, { error: 'Invalid order configuration' }, nativeOrigin);

  const endpoint = httpsUrl(env.CHECKOUT_SESSION_WEBHOOK_URL);
  const token = env.CHECKOUT_SESSION_WEBHOOK_TOKEN?.trim();
  if (!endpoint || !token) return reply(503, { error: 'Checkout temporarily unavailable' }, nativeOrigin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const provider = await fetch(endpoint, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': input.requestId },
      body: JSON.stringify({
        ...input, supplierSku: sourceProduct.supplier_sku, supplierId: sourceProduct.supplier_id,
        fulfillmentMode: sourceProduct.fulfillment_mode, currency: offer.currency,
        amountCents: Math.round(offer.priceUsd * 100), shippingAmountCents: Math.round(zone.rateUsd * 100),
        finalSaleAcknowledgedAt: new Date().toISOString(),
      }),
    });
    if (!provider.ok) {
      await provider.body?.cancel();
      return reply(502, { error: 'Checkout temporarily unavailable' }, nativeOrigin);
    }
    const result: unknown = await provider.json();
    const url = result && typeof result === 'object' && 'url' in result && typeof result.url === 'string' ? httpsUrl(result.url) : undefined;
    if (!url || url.origin !== offer.checkoutOrigin) return reply(502, { error: 'Checkout temporarily unavailable' }, nativeOrigin);
    return reply(200, { url: url.href }, nativeOrigin);
  } catch {
    return reply(502, { error: 'Checkout temporarily unavailable' }, nativeOrigin);
  } finally {
    clearTimeout(timer);
  }
}
