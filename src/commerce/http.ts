import { Capacitor } from '@capacitor/core';
import { parseApiBase } from './api-base';

const apiOrigin = parseApiBase(import.meta.env.VITE_API_BASE_URL)?.origin;
const storefrontOrigin = 'https://carat.evercrest.vip';

export function apiEndpoint(path: `/api/${string}`): string {
  return `${apiOrigin ?? (Capacitor.isNativePlatform() ? storefrontOrigin : '')}${path}`;
}

export class CommerceError extends Error {
  constructor(readonly status: number, readonly publicMessage?: string) {
    super(`Commerce API request failed (${status}).`);
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function apiRequest(path: `/api/${string}`, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(abort, 20_000);

  try {
    const response = await fetch(apiEndpoint(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    const data: unknown = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const message = [400, 409, 422].includes(response.status) && record(data) && typeof data.error === 'string' && data.error.length <= 240
        ? data.error : undefined;
      throw new CommerceError(response.status, message);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function newRequestId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function secureHostedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    // Ignore malformed payment links.
  }
}
