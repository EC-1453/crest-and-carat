import { ApiError, isRequestId, parseEmail, readJson } from './security';

export interface SubscriberEnv {
  DB: D1Database;
  ENVIRONMENT: 'production' | 'test';
  N8N_WEBHOOK_URL?: string;
  N8N_WEBHOOK_SECRET?: string;
  SUPPORT_EMAIL?: string;
}

type Source = 'vip' | 'inquiry' | 'checkout' | 'buyer' | 'newsletter';

interface Entry {
  requestId: string;
  source: Source;
  email: string;
  fullName: string | null;
  sourcePage: string;
  interestCategory: string | null;
  message: string | null;
  marketingOptIn: boolean;
  timestamp: string;
}

interface SubscriberRow {
  request_id: string;
  source: Source;
  email: string;
  full_name: string | null;
  source_page: string;
  interest_category: string | null;
  message: string | null;
  marketing_opt_in: number;
  consent_timestamp: string | null;
  created_at: string;
  n8n_synced: number;
}

export function insertSubscriber(db: D1Database, entry: Entry, orderId: string | null = null): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO subscribers (
      request_id, source, email, full_name, source_page, interest_category, message,
      marketing_opt_in, consent_timestamp, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? IS NULL OR EXISTS (SELECT 1 FROM orders WHERE id = ?)
    ON CONFLICT (request_id) DO NOTHING
  `).bind(entry.requestId, entry.source, entry.email, entry.fullName, entry.sourcePage,
    entry.interestCategory, entry.message, Number(entry.marketingOptIn),
    entry.marketingOptIn ? entry.timestamp : null, entry.timestamp, orderId, orderId);
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new ApiError('The submission contains an invalid field.');
  }
  return value.trim() || null;
}

export async function saveSubscriber(env: SubscriberEnv, request: Request): Promise<SubscriberRow> {
  const body = await readJson(request, 12_000);
  const source = body.source;
  if (source !== 'vip' && source !== 'newsletter' && source !== 'inquiry' && source !== 'checkout') {
    throw new ApiError('The submission source is invalid.');
  }
  const email = parseEmail(body.email);
  if (!email || !isRequestId(body.requestId) || typeof body.marketingConsent !== 'boolean' ||
      ((source === 'vip' || source === 'newsletter') && !body.marketingConsent) ||
      (body.website !== undefined && body.website !== '')) {
    throw new ApiError('Check your email address and consent selection.');
  }
  const message = optionalText(body.message, 2000);
  const fullName = optionalText(body.fullName ?? body.name, 100);
  if (source === 'inquiry' && !message) throw new ApiError('Enter a message for the concierge.');
  const category = optionalText(body.interestCategory ?? body.productSlug, 80);
  if (category && !/^[a-z0-9][a-z0-9-]*$/i.test(category)) throw new ApiError('The interest category is invalid.');
  if (source === 'checkout' && !category) throw new ApiError('The selected piece is missing.');
  const sourcePage = optionalText(body.sourcePage, 200) ??
    (source === 'inquiry' ? '/contact/' : source === 'checkout' ? '/bag/' : '/');
  if (!/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/i.test(sourcePage)) throw new ApiError('The source page is invalid.');
  const entry: Entry = {
    requestId: body.requestId.toLowerCase(), source, email, fullName, message,
    sourcePage, interestCategory: category, marketingOptIn: body.marketingConsent, timestamp: new Date().toISOString(),
  };
  const saved = await env.DB.batch<SubscriberRow>([
    insertSubscriber(env.DB, entry),
    env.DB.prepare('SELECT * FROM subscribers WHERE request_id = ?').bind(entry.requestId),
  ]);
  const row = saved[1].results[0];
  if (!row || row.source !== entry.source || row.email !== entry.email || row.full_name !== entry.fullName ||
      row.source_page !== entry.sourcePage || row.interest_category !== entry.interestCategory ||
      row.message !== entry.message || Boolean(row.marketing_opt_in) !== entry.marketingOptIn) {
    throw new ApiError('This request identifier has already been used.', 409);
  }
  return row;
}

function webhookUrl(env: SubscriberEnv): URL | null {
  if (env.ENVIRONMENT !== 'production' || !env.N8N_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET) return null;
  try {
    const url = new URL(env.N8N_WEBHOOK_URL);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url : null;
  } catch {
    return null;
  }
}

export async function forwardSubscriber(env: SubscriberEnv, row: SubscriberRow): Promise<boolean> {
  if (row.n8n_synced) return true;
  const url = webhookUrl(env);
  if (!url) return false;
  const now = Date.now();
  const claimUntil = now + 60_000;
  const claim = await env.DB.prepare(`
    UPDATE subscribers SET sync_claim_until = ? WHERE request_id = ? AND n8n_synced = 0
      AND (sync_claim_until IS NULL OR sync_claim_until < ?) RETURNING request_id
  `).bind(claimUntil, row.request_id, now).first<{ request_id: string }>();
  if (!claim) return false;

  let syncedAt: string | null = null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': row.request_id,
        Authorization: `Bearer ${env.N8N_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        requestId: row.request_id, source: row.source, email: row.email, name: row.full_name,
        sourcePage: row.source_page, interestCategory: row.interest_category,
        productSlug: row.interest_category, message: row.message, createdAt: row.created_at,
        marketingConsent: Boolean(row.marketing_opt_in), marketingConsentedAt: row.consent_timestamp,
        conciergeEmail: env.SUPPORT_EMAIL?.trim() || 'privateclient@evercrest.vip',
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(6500),
    });
    if (response.ok) syncedAt = new Date().toISOString();
    await response.body?.cancel();
  } catch {
    // The durable record remains available for the next reconciliation.
  }
  await env.DB.prepare(`
    UPDATE subscribers SET n8n_synced = ?, synced_at = ?, sync_claim_until = ?
    WHERE request_id = ? AND sync_claim_until = ?
  `).bind(Number(syncedAt !== null), syncedAt, syncedAt ? null : now + 10 * 60_000, row.request_id, claimUntil).run();
  return syncedAt !== null;
}

export async function syncSubscribers(env: SubscriberEnv): Promise<void> {
  if (!webhookUrl(env)) return;
  const pending = await env.DB.prepare(`
    SELECT * FROM subscribers WHERE n8n_synced = 0 AND (sync_claim_until IS NULL OR sync_claim_until < ?)
    ORDER BY created_at LIMIT 4
  `).bind(Date.now()).all<SubscriberRow>();
  await Promise.allSettled(pending.results.map((row) => forwardSubscriber(env, row)));
}
