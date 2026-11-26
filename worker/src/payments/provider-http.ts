export class ProviderError extends Error {
  constructor(readonly status: number | null, readonly code: string) {
    super(code)
  }
}

export function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function string(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function cents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null
  const [units, fraction = ''] = String(value).split('.')
  const result = Number(units) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : null
}

export function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

export function providerId(value: unknown): string | null {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return /^[a-zA-Z0-9_-]{1,160}$/.test(id) ? id : null
}

export async function providerJson(url: string, options: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ProviderError(null, 'provider_connection_error')
  }
  if (!response.ok) throw new ProviderError(response.status, 'provider_http_error')
  try {
    return await response.json()
  } catch {
    throw new ProviderError(null, 'invalid_provider_response')
  }
}

export function parseWebhook(raw: string): Record<string, unknown> | null {
  try {
    return object(JSON.parse(raw))
  } catch {
    return null
  }
}

export function recentTimestamp(timestamp: string): boolean {
  return /^\d{9,12}$/.test(timestamp)
    && Math.abs(Date.now() / 1_000 - Number(timestamp)) <= 300
}

export function hexBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\da-f]{64}$/i.test(hex)) return null
  const decoded = new Uint8Array(32)
  for (let i = 0; i < decoded.length; i++) {
    decoded[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return decoded
}

export function base64Bytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

export async function verifyHmac(
  key: Uint8Array,
  message: string,
  signatures: readonly (Uint8Array<ArrayBuffer> | null)[],
): Promise<boolean> {
  if (!key.length || !signatures.length) return false
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  )
  const bytes = new TextEncoder().encode(message)
  const verified = await Promise.all(signatures.map((signature) => signature?.length === 32
    ? crypto.subtle.verify('HMAC', cryptoKey, signature, bytes)
    : false))
  return verified.some(Boolean)
}
