export interface EmailEnv {
  DB: D1Database
  ENVIRONMENT: 'test' | 'production'
  EMAIL_PROVIDER?: string
  RESEND_API_KEY?: string
  POSTMARK_SERVER_TOKEN?: string
  MAILCHANNELS_API_KEY?: string
  SENDER_EMAIL?: string
  SUPPORT_EMAIL?: string
}

type EmailProvider = 'resend' | 'postmark' | 'mailchannels'
type EmailState = 'pending' | 'sending' | 'sent' | 'manual'
type EmailKind = 'manual_fulfillment' | 'merchant_dispatch' | 'supplier_dispatch' | 'buyer_dispatch' | 'shipment'

interface EmailPayload {
  from: string
  replyTo: string
  to: string
  subject: string
  text: string
  html: string
}

interface EmailRow {
  id: string
  state: EmailState
  payload_json: string
  next_attempt_at: string
  first_attempt_at: string | null
  provider: EmailProvider | null
  attempts: number
}

interface Message {
  id: string
  orderId: string
  kind: EmailKind
  to: string
  subject: string
  heading: string
  paragraphs: string[]
  lines?: string[]
  link?: string
}

const merchantInbox = 'privateclient@evercrest.vip'
const supportInbox = 'support@evercrest.vip'
const minute = 60_000

export function emailAddress(value: string | undefined): string | undefined {
  const address = value?.trim()
  return address && address.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address) ? address : undefined
}

export function senderAddress(env: EmailEnv): string {
  return emailAddress(env.SENDER_EMAIL) ?? merchantInbox
}

export function supportAddress(env: EmailEnv): string {
  return emailAddress(env.SUPPORT_EMAIL) ?? supportInbox
}

export function merchantAddress(): string {
  return merchantInbox
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function emailStatement(
  env: EmailEnv,
  now: string,
  message: Message,
  claim?: { jobId: string; lease: string },
): D1PreparedStatement {
  const { id, orderId, kind, to, subject, heading, paragraphs, lines, link } = message
  const from = senderAddress(env)
  const replyTo = supportAddress(env)
  const text = ['CREST & CARAT', heading, ...paragraphs, ...(lines ?? []),
    ...(link ? [`Track your order: ${link}`] : []), `Private Client Services · ${replyTo}`].join('\n\n')
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6f2eb;color:#252625;font:16px/1.6 Georgia,serif">
  <main style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="letter-spacing:0.16em;font-size:13px">CREST &amp; CARAT</p>
    <h1 style="font-weight:normal;font-size:28px;line-height:1.2">${escapeHtml(heading)}</h1>
    ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    ${lines?.length ? `<ul>${lines.map((line) => `<li style="white-space:pre-wrap">${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
    ${link ? `<p><a clicktracking="off" style="display:inline-block;background:#263d34;color:#fff;padding:12px 20px" href="${escapeHtml(link)}">Track your order</a></p>` : ''}
    <p style="font-size:14px">Private Client Services · <a style="color:#263d34" href="mailto:${escapeHtml(replyTo)}">${escapeHtml(replyTo)}</a></p>
  </main></body></html>`
  const payload = { from, replyTo, to, subject, text, html } satisfies EmailPayload
  const guard = claim ? 'EXISTS (SELECT 1 FROM fulfillment_jobs WHERE id = ? AND lease_token = ?)' : '1'
  return env.DB.prepare(`INSERT INTO email_outbox
    (id, order_id, kind, state, payload_json, next_attempt_at, created_at, updated_at)
    SELECT ?, ?, ?, 'pending', ?, ?, ?, ? WHERE ${guard}
    ON CONFLICT(id) DO NOTHING`).bind(id, orderId, kind, JSON.stringify(payload), now, now, now,
    ...(claim ? [claim.jobId, claim.lease] : []))
}

interface Provider {
  id: EmailProvider
  key: string
}

function configuredProvider(env: EmailEnv): Provider | undefined {
  if (env.ENVIRONMENT !== 'production') return undefined
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) return { id: 'resend', key: env.RESEND_API_KEY }
  if (env.EMAIL_PROVIDER === 'postmark' && env.POSTMARK_SERVER_TOKEN) return { id: 'postmark', key: env.POSTMARK_SERVER_TOKEN }
  if (env.EMAIL_PROVIDER === 'mailchannels' && env.MAILCHANNELS_API_KEY) {
    return { id: 'mailchannels', key: env.MAILCHANNELS_API_KEY }
  }
  return undefined
}

class MailError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code)
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function validPayload(value: unknown): value is EmailPayload {
  const item = object(value)
  return item !== null && typeof item.from === 'string' && emailAddress(item.from) === item.from
    && typeof item.replyTo === 'string' && emailAddress(item.replyTo) === item.replyTo
    && typeof item.to === 'string' && emailAddress(item.to) === item.to
    && typeof item.subject === 'string' && typeof item.text === 'string' && typeof item.html === 'string'
}

async function sendMail(provider: Provider, id: string, payload: EmailPayload): Promise<string> {
  const { from, replyTo, to, subject, text, html } = payload
  const sender = `Crest & Carat <${from}>`
  const common = { 'Content-Type': 'application/json' }
  const transports = {
    resend: {
      url: 'https://api.resend.com/emails',
      headers: { ...common, Authorization: `Bearer ${provider.key}`, 'Idempotency-Key': id },
      body: { from: sender, to: [to], reply_to: replyTo, subject, text, html },
    },
    postmark: {
      url: 'https://api.postmarkapp.com/email',
      headers: { ...common, Accept: 'application/json', 'X-Postmark-Server-Token': provider.key },
      body: {
        From: sender, To: to, ReplyTo: replyTo, Subject: subject, TextBody: text, HtmlBody: html,
        MessageStream: 'outbound', TrackLinks: 'None', TrackOpens: false, Metadata: { outbox_id: id },
      },
    },
    mailchannels: {
      url: 'https://api.mailchannels.net/tx/v1/send',
      headers: { ...common, 'X-Api-Key': provider.key },
      body: {
        from: { email: from, name: 'Crest & Carat' }, personalizations: [{ to: [{ email: to }] }],
        subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
        headers: { 'Reply-To': replyTo, 'X-Crest-Outbox-Id': id },
        transactional: true,
        tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
      },
    },
  }
  const transport = transports[provider.id]
  const response = await fetch(transport.url, {
    method: 'POST',
    redirect: 'manual',
    headers: transport.headers,
    body: JSON.stringify(transport.body),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    const body = response.status === 409 && provider.id === 'resend' ? object(await response.json().catch(() => null)) : null
    const retryable = response.status === 429 || (provider.id === 'resend'
      && (response.status === 408 || response.status >= 500 || body?.name === 'concurrent_idempotent_requests'))
    throw new MailError(`email_http_${response.status}`, retryable)
  }
  const body = object(await response.json())
  const result = Array.isArray(body?.results) ? object(body.results[0]) : null
  const reference = provider.id === 'resend' ? body?.id
    : provider.id === 'postmark' && body?.ErrorCode === 0 ? body.MessageID
      : provider.id === 'mailchannels' && result?.status === 'sent' ? result.message_id : null
  if (typeof reference !== 'string' || !reference || reference.length > 250) {
    throw new MailError('email_provider_response_unconfirmed', provider.id === 'resend')
  }
  return reference
}

async function processEmail(env: EmailEnv, provider: Provider, row: EmailRow): Promise<void> {
  const now = new Date().toISOString()
  const started = row.first_attempt_at ? Date.parse(row.first_attempt_at) : Date.now()
  const safeRetry = provider.id === 'resend' && Date.now() - started < 23 * 60 * minute
  if ((row.provider && row.provider !== provider.id) || (row.state === 'sending' && !safeRetry)
    || (provider.id === 'resend' && row.attempts > 0 && !safeRetry)) {
    await env.DB.prepare(`UPDATE email_outbox SET state = 'manual', lease_token = NULL,
      last_error = 'email_attempt_requires_review', updated_at = ?
      WHERE id = ? AND state = ? AND next_attempt_at = ? AND next_attempt_at <= ?`)
      .bind(now, row.id, row.state, row.next_attempt_at, now).run()
    return
  }
  const lease = crypto.randomUUID()
  const claimed = await env.DB.prepare(`UPDATE email_outbox
    SET state = 'sending', provider = ?, lease_token = ?, first_attempt_at = COALESCE(first_attempt_at, ?),
      next_attempt_at = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND state = ? AND next_attempt_at = ? AND next_attempt_at <= ?`)
    .bind(provider.id, lease, now, new Date(Date.now() + 2 * minute).toISOString(), now, row.id, row.state,
      row.next_attempt_at, now).run()
  if (claimed.meta.changes !== 1) return

  let reference: string
  try {
    const payload: unknown = JSON.parse(row.payload_json)
    if (!validPayload(payload)) throw new MailError('email_payload_invalid', false)
    reference = await sendMail(provider, row.id, payload)
  } catch (error) {
    const retryable = error instanceof MailError ? error.retryable : safeRetry
    const state = retryable && row.attempts < 8 ? 'pending' : 'manual'
    const delay = Math.min(2 ** Math.min(row.attempts, 7), 60) * minute
    const code = error instanceof MailError ? error.code : 'email_request_outcome_unconfirmed'
    await env.DB.prepare(`UPDATE email_outbox SET state = ?, lease_token = NULL, last_error = ?,
      next_attempt_at = ?, updated_at = ? WHERE id = ? AND state = 'sending' AND lease_token = ?`)
      .bind(state, code, new Date(Date.now() + delay).toISOString(), new Date().toISOString(), row.id, lease).run()
    return
  }
  await env.DB.prepare(`UPDATE email_outbox SET state = 'sent', provider_reference = ?, lease_token = NULL,
    payload_json = '{}', last_error = NULL, updated_at = ? WHERE id = ? AND state = 'sending' AND lease_token = ?`)
    .bind(reference, new Date().toISOString(), row.id, lease).run()
}

export async function sendQueuedEmails(env: EmailEnv): Promise<void> {
  const provider = configuredProvider(env)
  if (!provider) return
  const now = new Date().toISOString()
  const { results } = await env.DB.prepare(`SELECT id, state, payload_json, next_attempt_at, first_attempt_at, provider, attempts
    FROM email_outbox WHERE state IN ('pending', 'sending') AND next_attempt_at <= ?
    ORDER BY next_attempt_at, id LIMIT 4`).bind(now).all<EmailRow>()
  for (const row of results) await processEmail(env, provider, row)
}
