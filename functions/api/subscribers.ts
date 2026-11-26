import type { D1Database, EventContext } from '@cloudflare/workers-types';

type Environment = {
  SUBSCRIBERS_DB?: D1Database;
  N8N_WEBHOOK_URL?: string;
  N8N_WEBHOOK_SECRET?: string;
  SUPPORT_EMAIL?: string;
};

type Context = Pick<EventContext<Environment, never, Record<string, unknown>>, 'request' | 'env'>;
type Source = 'vip' | 'inquiry' | 'checkout';
type Entry = {
  requestId: string;
  source: Source;
  email: string;
  name: string | null;
  productSlug: string | null;
  message: string | null;
  createdAt: string;
  marketingConsentedAt: string | null;
};
type SavedEntry = Omit<Entry, 'requestId'> & { forwardedAt: string | null };

const nativeOrigins = new Set(['capacitor://localhost', 'https://localhost']);
const maximumBodySize = 12_000;
const emailPattern = /^[^\s@\u0000-\u001F\u007F]+@[^\s@\u0000-\u001F\u007F]+\.[^\s@\u0000-\u001F\u007F]+$/u;
const claimDuration = 30_000;

function reply(body: object | null, status: number, corsOrigin?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  if (body) headers.set('Content-Type', 'application/json; charset=utf-8');
  if (corsOrigin) {
    headers.set('Access-Control-Allow-Origin', corsOrigin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (status === 405) headers.set('Allow', 'POST, OPTIONS');
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

async function readBody(request: Context['request']): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > maximumBodySize) throw new Error('Invalid body size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');

  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBodySize) {
        await reader.cancel();
        throw new Error('Invalid body size');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function parseEntry(value: unknown): Entry | null {
  if (!value || typeof value !== 'object') return null;
  const { source, email, requestId, marketingConsent, name, message, productSlug, website } = value as Record<string, unknown>;
  if (source !== 'vip' && source !== 'inquiry' && source !== 'checkout') return null;
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(requestId)) return null;
  if (typeof email !== 'string' || email.length > 254 || !emailPattern.test(email.trim())) return null;
  if (typeof marketingConsent !== 'boolean' || (source === 'vip' && !marketingConsent)) return null;
  if (website !== undefined && website !== '') return null;
  if (name !== undefined && (source !== 'inquiry' || typeof name !== 'string' || name.length > 100)) return null;
  if (message !== undefined && (source !== 'inquiry' || typeof message !== 'string' || message.length > 2000)) return null;
  if (source === 'inquiry' && (typeof message !== 'string' || !message.trim())) return null;
  if (productSlug !== undefined && (source === 'vip' || typeof productSlug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(productSlug))) return null;
  if (source === 'checkout' && typeof productSlug !== 'string') return null;

  const createdAt = new Date().toISOString();
  const cleanEmail = email.trim();
  const domainStart = cleanEmail.lastIndexOf('@') + 1;
  return {
    requestId,
    source,
    email: cleanEmail.slice(0, domainStart) + cleanEmail.slice(domainStart).toLowerCase(),
    name: typeof name === 'string' ? name.trim() || null : null,
    productSlug: typeof productSlug === 'string' ? productSlug : null,
    message: typeof message === 'string' ? message.trim() || null : null,
    createdAt,
    marketingConsentedAt: marketingConsent ? createdAt : null,
  };
}

async function saveEntry(database: D1Database, entry: Entry): Promise<SavedEntry | null> {
  await database.prepare(`
    INSERT INTO subscriber_events (request_id, source, email, name, product_slug, message, created_at, marketing_consented_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (request_id) DO NOTHING
  `).bind(entry.requestId, entry.source, entry.email, entry.name, entry.productSlug, entry.message, entry.createdAt, entry.marketingConsentedAt).run();

  const saved = await database.prepare(`
    SELECT source, email, name, product_slug AS productSlug, message, created_at AS createdAt,
           marketing_consented_at AS marketingConsentedAt, forwarded_at AS forwardedAt
    FROM subscriber_events WHERE request_id = ?
  `).bind(entry.requestId).first<SavedEntry>();

  if (!saved || saved.source !== entry.source || saved.email !== entry.email || saved.name !== entry.name ||
    saved.productSlug !== entry.productSlug || saved.message !== entry.message ||
    Boolean(saved.marketingConsentedAt) !== Boolean(entry.marketingConsentedAt)) return null;
  return saved;
}

function parseWebhook(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {
    return undefined;
  }
  return undefined;
}

async function forwardEntry(database: D1Database, env: Environment, entry: Entry, saved: SavedEntry) {
  if (saved.forwardedAt) return true;
  const endpoint = parseWebhook(env.N8N_WEBHOOK_URL);
  if (!endpoint) return false;

  const now = Date.now();
  const claimUntil = now + claimDuration;
  const claim = await database.prepare(`
    UPDATE subscriber_events SET forwarding_claim_until = ? WHERE request_id = ? AND forwarded_at IS NULL
      AND (forwarding_claim_until IS NULL OR forwarding_claim_until < ?) RETURNING request_id
  `).bind(claimUntil, entry.requestId, now).first<{ request_id: string }>();
  if (!claim) return false;

  const headers = new Headers({ 'Content-Type': 'application/json', 'Idempotency-Key': entry.requestId });
  if (env.N8N_WEBHOOK_SECRET) headers.set('Authorization', `Bearer ${env.N8N_WEBHOOK_SECRET}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  let forwardedAt: string | null = null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requestId: entry.requestId,
        source: saved.source,
        email: saved.email,
        name: saved.name,
        productSlug: saved.productSlug,
        message: saved.message,
        createdAt: saved.createdAt,
        marketingConsent: saved.marketingConsentedAt !== null,
        marketingConsentedAt: saved.marketingConsentedAt,
        conciergeEmail: env.SUPPORT_EMAIL?.trim() || 'privateclient@evercrest.vip',
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.ok) forwardedAt = new Date().toISOString();
    await response.body?.cancel();
  } catch {
    // Leave the saved inquiry available for the concierge. The same request can be retried.
  } finally {
    clearTimeout(timer);
  }

  await database.prepare(`
    UPDATE subscriber_events SET forwarded_at = ?, forwarding_claim_until = NULL WHERE request_id = ? AND forwarding_claim_until = ?
  `).bind(forwardedAt, entry.requestId, claimUntil).run();
  return forwardedAt !== null;
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  const origin = request.headers.get('Origin');
  const nativeOrigin = origin && nativeOrigins.has(origin) ? origin : undefined;
  if (origin && origin !== new URL(request.url).origin && !nativeOrigin) return reply({ error: 'Forbidden' }, 403);
  if (!origin && request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply({ error: 'Forbidden' }, 403);
  if (request.method === 'OPTIONS') return reply(null, 204, nativeOrigin);
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, nativeOrigin);
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return reply({ error: 'Expected JSON' }, 415, nativeOrigin);
  }

  let entry: Entry | null;
  try {
    entry = parseEntry(await readBody(request));
  } catch {
    return reply({ error: 'Invalid submission' }, 400, nativeOrigin);
  }
  if (!entry) return reply({ error: 'Invalid submission' }, 400, nativeOrigin);
  if (!env.SUBSCRIBERS_DB) return reply({ error: 'Concierge temporarily unavailable' }, 503, nativeOrigin);

  let saved: SavedEntry | null;
  try {
    saved = await saveEntry(env.SUBSCRIBERS_DB, entry);
  } catch {
    return reply({ error: 'Concierge temporarily unavailable' }, 503, nativeOrigin);
  }
  if (!saved) return reply({ error: 'Invalid submission' }, 400, nativeOrigin);

  let delivered = false;
  try {
    delivered = await forwardEntry(env.SUBSCRIBERS_DB, env, entry, saved);
  } catch {
    // The submission is already stored even if the forwarding status update failed.
  }
  return reply({ saved: true, forwarding: delivered ? 'delivered' : 'manual' }, 200, nativeOrigin);
}
