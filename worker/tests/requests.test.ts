import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildWorkerBundle, createWorkerFixture, MockResponse, sampleAddress, stripeBindings,
  type WorkerBundle, type WorkerFixture,
} from './worker-fixture';

const signingSecret = 'local-tracking-only-fixture-00000000';
const sku = 'TEST-RING-6';
let bundle: WorkerBundle;
let worker: WorkerFixture;

beforeAll(async () => {
  bundle = await buildWorkerBundle();
  worker = await createWorkerFixture(bundle, { bindings: { TRACKING_SECRET: signingSecret, ...stripeBindings } });
  await worker.seedCatalog();
});

afterAll(async () => {
  try {
    await worker?.dispose();
  } finally {
    await bundle?.dispose();
  }
});

function quote(engraving: unknown) {
  return worker.post('/api/quote', {
    processor: 'stripe', items: [{ sku, quantity: 1, engraving }], address: sampleAddress,
  });
}

describe('Engraving rules at checkout', () => {
  it.each(['AB', 'AB'.repeat(10), '𐐀'.repeat(20), ' Élan '])('accepts and preserves the engraving %j', async (engraving) => {
    const response = await quote(engraving);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ quote: { items: [{ sku, engraving }] } });
  });

  it.each([
    ['missing required text', ''], ['text below the minimum', 'A'], ['text over the maximum', 'A'.repeat(21)],
    ['spaces alone', '  '], ['unapproved punctuation', 'A#'], ['an unapproved digit', 'A2'],
    ['an unapproved emoji', 'A💎'], ['a line break', 'AB\n'], ['an invisible format character', 'A\u200DB'],
  ])('rejects %s before a quote or payment can be created', async (_label, engraving) => {
    const response = await quote(engraving);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('engraving instructions') });
  });

  it('rejects malformed engraving fields in the request and creates no orders', async () => {
    for (const engraving of [42, null, 'A'.repeat(513)]) {
      const response = await quote(engraving);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('each bag line') });
    }
    expect(await worker.db.prepare('SELECT COUNT(*) AS count FROM orders').first('count')).toBe(0);
  });
});

describe('D1 subscriber storage', () => {
  it('keeps one VIP consent record after simultaneous submissions and rejects reusing its ID for new details', async () => {
    const requestId = randomUUID();
    const payload = {
      requestId, source: 'vip', email: '  PrivateBuyer@EXAMPLE.TEST  ', sourcePage: '/',
      interestCategory: 'fine-jewelry', marketingConsent: true, website: '',
    };
    const results = await Promise.all([
      worker.post('/api/subscribers', payload),
      worker.post('/api/subscribers', { ...payload, requestId: requestId.toUpperCase() }),
    ]);
    expect(results.map(({ status }) => status)).toEqual([200, 200]);
    expect(await Promise.all(results.map((response) => response.json()))).toEqual([
      { saved: true, forwarding: 'manual' }, { saved: true, forwarding: 'manual' },
    ]);
    const conflict = await worker.post('/api/subscribers', { ...payload, email: 'other@example.test' });
    expect(conflict.status).toBe(409);

    const { results: rows } = await worker.db.prepare(`
      SELECT email, source, source_page, interest_category, marketing_opt_in, consent_timestamp, created_at, n8n_synced
      FROM subscribers WHERE request_id = ?
    `).bind(requestId).all<{ created_at: string }>();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toEqual({
      email: 'PrivateBuyer@example.test', source: 'vip', source_page: '/', interest_category: 'fine-jewelry',
      marketing_opt_in: 1, consent_timestamp: row.created_at, created_at: expect.any(String), n8n_synced: 0,
    });
    expect(Number.isNaN(Date.parse(row.created_at))).toBe(false);
  });

  it('saves an inquiry without consent and refuses unconsented VIP or honeypot submissions', async () => {
    const requestId = randomUUID();
    const inquiry = await worker.post('/api/subscribers', {
      requestId, source: 'inquiry', email: 'buyer@example.test', fullName: ' Sample Buyer ',
      message: ' Please send sizing details. ', marketingConsent: false,
    });
    expect(inquiry.status).toBe(200);
    expect(await worker.db.prepare(`
      SELECT full_name, source_page, message, marketing_opt_in, consent_timestamp FROM subscribers WHERE request_id = ?
    `).bind(requestId).first()).toEqual({
      full_name: 'Sample Buyer', source_page: '/contact/', message: 'Please send sizing details.',
      marketing_opt_in: 0, consent_timestamp: null,
    });

    for (const rejected of [{ marketingConsent: false, website: '' }, { marketingConsent: true, website: 'spam' }]) {
      const rejectedId = randomUUID();
      const response = await worker.post('/api/subscribers', {
        requestId: rejectedId, source: 'vip', email: 'buyer@example.test', ...rejected,
      });
      expect(response.status).toBe(400);
      expect(await worker.db.prepare('SELECT request_id FROM subscribers WHERE request_id = ?').bind(rejectedId).first()).toBeNull();
    }
  });

  it('keeps an unsynced D1 row when mocked n8n fails and marks it synced only after a successful retry', async () => {
    const endpoint = 'https://n8n.example.test/subscribers';
    const token = 'local-n8n-fixture-secret';
    const calls: { url: string; method: string; authorization: string | null; key: string | null; body: unknown }[] = [];
    const deliveryWorker = await createWorkerFixture(bundle, {
      bindings: {
        ENVIRONMENT: 'production', STOREFRONT_ORIGIN: 'https://carat.evercrest.vip',
        N8N_WEBHOOK_URL: endpoint, N8N_WEBHOOK_SECRET: token,
      },
      outbound: async (request) => {
        calls.push({
          url: request.url, method: request.method, authorization: request.headers.get('Authorization'),
          key: request.headers.get('Idempotency-Key'), body: await request.json(),
        });
        return new MockResponse(null, { status: calls.length === 1 ? 503 : 204 });
      },
    });
    try {
      const requestId = randomUUID();
      const payload = { requestId, source: 'vip', email: 'subscriber@example.test', marketingConsent: true };
      const first = await deliveryWorker.post('/api/subscribers', payload);
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ saved: true, forwarding: 'manual' });
      const saved = await deliveryWorker.db.prepare(`
        SELECT n8n_synced, synced_at, consent_timestamp FROM subscribers WHERE request_id = ?
      `).bind(requestId).first();
      expect(saved).toEqual({ n8n_synced: 0, synced_at: null, consent_timestamp: expect.any(String) });
      expect(calls).toHaveLength(1);

      await deliveryWorker.db.prepare('UPDATE subscribers SET sync_claim_until = 0 WHERE request_id = ?')
        .bind(requestId).run();
      await deliveryWorker.schedule('2-59/5 * * * *');
      expect(await deliveryWorker.db.prepare(`
        SELECT n8n_synced, synced_at, consent_timestamp FROM subscribers WHERE request_id = ?
      `).bind(requestId).first()).toEqual({
        n8n_synced: 1, synced_at: expect.any(String), consent_timestamp: saved?.consent_timestamp,
      });
      const expectedCall = {
        url: endpoint, method: 'POST', authorization: `Bearer ${token}`, key: requestId,
        body: expect.objectContaining({
          requestId, email: payload.email, marketingConsent: true, marketingConsentedAt: saved?.consent_timestamp,
        }),
      };
      const replay = await deliveryWorker.post('/api/subscribers', payload);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ saved: true, forwarding: 'delivered' });
      expect(calls).toEqual([expectedCall, expectedCall]);
    } finally {
      await deliveryWorker.dispose();
    }
  });
});

function signature(reference: string, purpose = 'order-access', environment = 'test') {
  return createHmac('sha256', signingSecret).update(JSON.stringify([environment, purpose, reference])).digest('hex');
}

async function seedOrder(reference: string, checkoutUrl: string | null) {
  const orderId = randomUUID();
  const now = new Date().toISOString();
  const status = checkoutUrl ? 'pending' : 'paid';
  await worker.db.prepare(`
    INSERT INTO orders (
      id, order_reference, request_id, request_hash, email, address_json, processor, status, currency,
      subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_region, shipping_label,
      tax_disclosure, terms_version, terms_accepted_at, checkout_state, checkout_url, received_cents, paid_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'fixture', 'private@example.test', ?, 'stripe', ?, 'USD', 13000, 2000, 0, 15000,
      'US', 'Insured delivery', 'Fixture tax', 'fixture-v1', ?, 'ready', ?, ?, ?, ?, ?)
  `).bind(orderId, reference, randomUUID(), JSON.stringify(sampleAddress), status, now, checkoutUrl,
    status === 'paid' ? 15000 : 0, status === 'paid' ? now : null, now, now).run();
  return { orderId, now };
}

describe('Signed private order tracking', () => {
  it('requires a tracking signature bound to the order, environment and purpose', async () => {
    const orderReference = `CC-${randomUUID().toUpperCase()}`;
    const otherReference = `CC-${randomUUID().toUpperCase()}`;
    const unknownReference = `CC-${randomUUID().toUpperCase()}`;
    const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_private_fixture';
    const { orderId, now } = await seedOrder(orderReference, null);
    await seedOrder(otherReference, checkoutUrl);
    const jobId = randomUUID();
    await worker.db.batch([
      worker.db.prepare(`
        INSERT INTO fulfillment_jobs (id, order_id, supplier, merchant_reference, status, created_at, updated_at)
        VALUES (?, ?, 'manual', ?, 'shipped', ?, ?)
      `).bind(jobId, orderId, `CC-${jobId.replaceAll('-', '').toUpperCase()}`, now, now),
      worker.db.prepare(`
        INSERT INTO shipments (id, job_id, carrier, tracking_number, tracking_url, created_at)
        VALUES (?, ?, 'UPS', '1ZTESTTRACKING', 'https://www.ups.com/track', ?)
      `).bind(randomUUID(), jobId, now),
    ]);

    const token = signature(orderReference);
    const changedToken = `${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}`;
    for (const body of [
      { orderReference }, { orderReference, token: changedToken }, { orderReference, token: signature(otherReference) },
      { orderReference, token: signature(orderReference, 'checkout-quote') },
      { orderReference, token: signature(orderReference, 'order-access', 'production') },
      { orderReference: unknownReference, token: signature(unknownReference) },
    ]) {
      const denied = await worker.post('/api/track', body);
      expect(denied.status).toBe(404);
      expect(denied.headers.get('Cache-Control')).toBe('no-store');
      expect(await denied.json()).toEqual({ error: 'This private order link is invalid.' });
    }

    const fromQuery = await worker.request(`/api/track?orderReference=${orderReference}&token=${token}`);
    expect(fromQuery.status).toBe(405);

    const allowed = await worker.post('/api/track', { orderReference, token });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Cache-Control')).toBe('no-store');
    expect(allowed.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await allowed.json()).toEqual({
      orderReference, status: 'paid', checkoutUrl: null,
      shipments: [{ carrier: 'UPS', trackingNumber: '1ZTESTTRACKING', shippedAt: now }],
    });

    const other = await worker.post('/api/track', { orderReference: otherReference, token: signature(otherReference) });
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({ orderReference: otherReference, status: 'pending', checkoutUrl, shipments: [] });
  });
});
