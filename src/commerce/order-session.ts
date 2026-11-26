import type { OrderResult, TrackingInput } from './api';
import { newRequestId, record, secureHostedUrl } from './http';

const attemptKey = 'crest-and-carat.order-attempt.v1';
const recentKey = 'crest-and-carat.recent-order.v1';
let currentAttempt: { fingerprint: string; requestId: string } | undefined;
let recentOrder: TrackingInput | undefined;

export async function orderRequestId(payload: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (currentAttempt?.fingerprint === fingerprint) return currentAttempt.requestId;

  try {
    const previous: unknown = JSON.parse(sessionStorage.getItem(attemptKey) ?? 'null');
    if (record(previous) && previous.fingerprint === fingerprint && typeof previous.requestId === 'string'
      && /^[a-f0-9]{32}$/u.test(previous.requestId)) {
      currentAttempt = { fingerprint, requestId: previous.requestId };
      return currentAttempt.requestId;
    }
  } catch {
    // The active page can still safely retry an order when session storage is limited.
  }

  currentAttempt = { fingerprint, requestId: newRequestId() };
  try { sessionStorage.setItem(attemptKey, JSON.stringify(currentAttempt)); } catch { /* In-memory retry remains available. */ }
  return currentAttempt.requestId;
}

export function forgetOrderAttempt() {
  currentAttempt = undefined;
  try { sessionStorage.removeItem(attemptKey); } catch { /* No persistent attempt exists in this browser. */ }
}

export function trackingLink({ orderReference, token }: TrackingInput): string {
  return `/track-order/#${new URLSearchParams({ order: orderReference, token })}`;
}

export function rememberOrder(input: TrackingInput) {
  recentOrder = input;
  try { sessionStorage.setItem(recentKey, JSON.stringify(input)); } catch { /* A private tracking link is still available on the order. */ }
}

export function readRecentOrder(): TrackingInput | undefined {
  if (recentOrder) return recentOrder;
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(recentKey) ?? 'null');
    if (record(data) && typeof data.orderReference === 'string' && typeof data.token === 'string') return {
      orderReference: data.orderReference, token: data.token,
    };
  } catch {
    // A shopper can still open their private tracking link.
  }
}

export function consumeTrackingFragment(): TrackingInput | undefined {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const orderReference = params.get('order');
  const token = params.get('token');
  if (!orderReference || !token) return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  return { orderReference, token };
}

export function resumeHostedCheckout(order: OrderResult): string | undefined {
  return order.status === 'pending' && order.checkoutState === 'ready' && order.checkoutUrl
    ? secureHostedUrl(order.checkoutUrl) : undefined;
}

export function orderStatusText(status: string): string {
  switch (status) {
    case 'pending': return 'Payment pending';
    case 'partial': return 'Partial payment received';
    case 'payment_review': return 'Payment under review';
    case 'paid': return 'Payment confirmed';
    case 'processing': return 'Preparing your order';
    case 'shipped': return 'Shipped';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    case 'refunded': return 'Refunded';
    default: return 'Order received';
  }
}
