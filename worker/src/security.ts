export interface SecurityEnv {
  ENVIRONMENT: 'production' | 'test';
  STOREFRONT_ORIGIN: string;
  TRACKING_SECRET?: string;
}

const encoder = new TextEncoder();
const orderReferencePattern = /^CC-[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/;

export function isOrderReference(value: unknown): value is string {
  return typeof value === 'string' && orderReferencePattern.test(value);
}

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value);
}

export function hasSigningSecret(env: SecurityEnv): boolean {
  return typeof env.TRACKING_SECRET === 'string' && env.TRACKING_SECRET.length >= 32;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signature(env: SecurityEnv, purpose: string, message: string): Promise<string> {
  if (!hasSigningSecret(env)) throw new Error('Order signing is unavailable');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.TRACKING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify([env.ENVIRONMENT, purpose, message]))));
}

export async function secretsEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const first = new Uint8Array(a);
  const second = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < first.length; index++) difference |= first[index] ^ second[index];
  return difference === 0;
}

export function requestSignature(env: SecurityEnv, request: unknown): Promise<string> {
  return signature(env, 'order-request', JSON.stringify(request));
}

export function trackingToken(env: SecurityEnv, orderReference: string): Promise<string> {
  return signature(env, 'order-access', orderReference);
}

export async function trackingLink(env: SecurityEnv, orderReference: string): Promise<string> {
  const url = new URL('/track-order/', env.STOREFRONT_ORIGIN);
  url.hash = new URLSearchParams({ order: orderReference, token: await trackingToken(env, orderReference) }).toString();
  return url.toString();
}

const quoteLifetime = 20 * 60_000;

export async function createQuoteToken(env: SecurityEnv, value: unknown): Promise<string> {
  const expires = Date.now() + quoteLifetime;
  return `${expires}.${await signature(env, 'checkout-quote', JSON.stringify([expires, value]))}`;
}

export async function validQuoteToken(env: SecurityEnv, token: string, value: unknown): Promise<boolean> {
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const now = Date.now();
  if (expires < now || expires > now + quoteLifetime) return false;
  return secretsEqual(match[2], await signature(env, 'checkout-quote', JSON.stringify([expires, value])));
}

export class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function readJson(request: Request, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError('Expected a JSON request.', 415);
  }
  if (Number(request.headers.get('Content-Length')) > maximumBytes) throw new ApiError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('The request body is missing.');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytesRead = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new ApiError('Request is too large.', 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    const data: unknown = JSON.parse(body + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('Expected a JSON object.');
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('The request body is invalid.');
  } finally {
    reader.releaseLock();
  }
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim();
  if (!/^[^\s@\u0000-\u001F\u007F]+@[^\s@\u0000-\u001F\u007F]+\.[^\s@\u0000-\u001F\u007F]+$/u.test(email)) return null;
  const domainStart = email.lastIndexOf('@') + 1;
  return email.slice(0, domainStart) + email.slice(domainStart).toLowerCase();
}
