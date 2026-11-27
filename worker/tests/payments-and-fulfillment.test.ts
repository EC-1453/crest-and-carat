import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  buildWorkerBundle, createSampleOrder, createWorkerFixture, MockResponse, sampleTotalCents, stripeBindings,
  webhookHeaders, type WorkerBundle, type WorkerFixture,
} from './worker-fixture';

let bundle: WorkerBundle;
let fixture: WorkerFixture | undefined;

beforeAll(async () => { bundle = await buildWorkerBundle(); }, 30_000);
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});
afterAll(async () => { await bundle?.dispose(); });

type Outbound = NonNullable<Parameters<typeof createWorkerFixture>[1]>['outbound'];
type OutboundRequest = Parameters<NonNullable<Outbound>>[0];

const stripeSessionId = 'cs_local_fixture';
const stripeWebhook = {
  id: 'evt_local_fixture',
  type: 'checkout.session.completed',
  livemode: false,
  data: { object: { id: stripeSessionId } },
};

function stripeProvider({ liveFixture = false } = {}) {
  let orderReference = '';
  const state = {
    createCalls: 0,
    reconcileCalls: 0,
    paid: false,
    receivedCents: sampleTotalCents,
    currency: 'usd',
    async outbound(request: OutboundRequest) {
      const url = new URL(request.url);
      expect(url.origin).toBe('https://api.stripe.com');
      expect(request.headers.get('Authorization')).toBe(
        `Bearer ${liveFixture ? 'sk_live_local_fixture' : stripeBindings.STRIPE_SECRET_KEY}`,
      );
      if (request.method === 'POST') {
        expect(url.pathname).toBe('/v1/checkout/sessions');
        state.createCalls++;
        orderReference = new URLSearchParams(await request.text()).get('client_reference_id') ?? '';
        expect(orderReference).toMatch(/^CC-/);
        expect(request.headers.get('Idempotency-Key')).toBe(`crest-carat-checkout-${orderReference}`);
      } else {
        expect(request.method).toBe('GET');
        expect(url.pathname).toBe(`/v1/checkout/sessions/${stripeSessionId}`);
        state.reconcileCalls++;
      }
      return MockResponse.json({
        id: stripeSessionId,
        url: `https://checkout.stripe.com/c/pay/${stripeSessionId}`,
        mode: 'payment',
        currency: 'usd',
        livemode: liveFixture,
        amount_total: sampleTotalCents,
        client_reference_id: orderReference,
        metadata: { order_reference: orderReference },
        status: state.paid ? 'complete' : 'open',
        payment_status: state.paid ? 'paid' : 'unpaid',
        payment_intent: state.paid ? {
          status: 'succeeded',
          currency: state.currency,
          livemode: liveFixture,
          amount: sampleTotalCents,
          amount_received: state.receivedCents,
          metadata: { order_reference: orderReference },
        } : null,
      });
    },
  };
  return state;
}

function postStripe(harness: WorkerFixture, event = stripeWebhook, secret = stripeBindings.STRIPE_WEBHOOK_SECRET) {
  return harness.post('/api/webhooks/stripe', event, webhookHeaders('Stripe-Signature', secret, event));
}

async function expectNoFulfillment(harness: WorkerFixture) {
  expect(await harness.db.prepare('SELECT count(*) AS count FROM fulfillment_jobs').first('count')).toBe(0);
  expect(await harness.db.prepare('SELECT count(*) AS count FROM email_outbox').first('count')).toBe(0);
}

describe('verified payment and fulfillment gating', () => {
  test.each([
    { label: 'settled amount', receivedCents: sampleTotalCents - 1, currency: 'usd' },
    { label: 'settled currency', receivedCents: sampleTotalCents, currency: 'eur' },
  ])('places a mismatched $label in review without fulfillment', async ({ receivedCents, currency }) => {
    const provider = stripeProvider();
    fixture = await createWorkerFixture(bundle, { bindings: stripeBindings, outbound: provider.outbound });
    await fixture.seedCatalog();
    const order = await createSampleOrder(fixture, 'stripe');
    Object.assign(provider, { paid: true, receivedCents, currency });

    expect((await postStripe(fixture)).status).toBe(204);
    await fixture.schedule('1-59/5 * * * *');
    expect(await fixture.db.prepare('SELECT status, received_cents, paid_at FROM orders').first())
      .toEqual({ status: 'payment_review', received_cents: receivedCents, paid_at: null });
    expect(await fixture.db.prepare("SELECT detail FROM payment_events WHERE status = 'payment_review'").first('detail'))
      .toBe('stripe_payment_mismatch');
    const tracking = await fixture.post('/api/track', { orderReference: order.orderReference, token: order.trackingToken });
    expect(await tracking.json()).toMatchObject({ status: 'payment_review', checkoutUrl: null });
    await expectNoFulfillment(fixture);
  });

  test('deduplicates concurrent and repeated signed payment webhooks', async () => {
    const provider = stripeProvider();
    const harness = fixture = await createWorkerFixture(bundle, { bindings: stripeBindings, outbound: provider.outbound });
    await harness.seedCatalog();
    const order = await createSampleOrder(harness, 'stripe');
    provider.paid = true;

    expect((await postStripe(harness, stripeWebhook, 'fixture-invalid-secret')).status).toBe(401);
    expect(provider.reconcileCalls).toBe(0);
    const replies = await Promise.all(Array.from({ length: 6 }, () => postStripe(harness)));
    expect(replies.map(({ status }) => status)).toEqual(Array(6).fill(204));
    expect((await postStripe(harness)).status).toBe(204);
    await harness.schedule('1-59/5 * * * *');
    expect(provider.createCalls).toBe(1);
    expect(provider.reconcileCalls).toBe(1);
    expect(await harness.db.prepare("SELECT count(*) AS count FROM payment_events WHERE status = 'webhook_processed'")
      .first('count')).toBe(1);
    expect(await harness.db.prepare("SELECT count(*) AS count FROM payment_events WHERE status = 'paid'").first('count')).toBe(1);
    expect(await harness.db.prepare('SELECT status, received_cents FROM orders').first())
      .toEqual({ status: 'paid', received_cents: sampleTotalCents });
    expect((await harness.db.prepare('SELECT supplier, status FROM fulfillment_jobs').all()).results)
      .toEqual([{ supplier: 'manual', status: 'manual' }]);
    expect((await harness.db.prepare('SELECT kind FROM email_outbox').all()).results).toEqual([{ kind: 'manual_fulfillment' }]);
    const tracking = await harness.post('/api/track', { orderReference: order.orderReference, token: order.trackingToken });
    expect(await tracking.json()).toEqual({
      orderReference: order.orderReference, status: 'paid', checkoutUrl: null, shipments: [],
    });
  });
});

const productionFixture = {
  ENVIRONMENT: 'production', // Required by the adapter guards. Miniflare still intercepts all egress.
  STOREFRONT_ORIGIN: 'https://carat.evercrest.vip',
};
const mercuryBindings = {
  ...productionFixture,
  MERCURY_ENABLED: 'true',
  MERCURY_EGRESS_APPROVED: 'true',
  MERCURY_TRANSFER_APPROVED: 'true',
  MERCURY_API_TOKEN: 'local-mercury-fixture',
  MERCURY_ACCOUNT_ID: 'local-mercury-account',
  MERCURY_WEBHOOK_SECRET: 'local-mercury-webhook',
};

test('keeps pending and partial Mercury ACH payments out of fulfillment until the full USD total settles', async () => {
  const invoiceId = 'local-invoice';
  const customerId = 'local-customer';
  let orderReference = '';
  let invoicePaid = false;
  const transfers: { id: string; amount: number; status: 'pending' | 'sent' }[] = [
    { id: 'local-ach-1', amount: 100, status: 'pending' },
  ];
  const invoice = () => ({
    id: invoiceId, slug: 'local-invoice-link', customerId,
    amount: sampleTotalCents / 100, invoiceNumber: orderReference,
    currencyCode: 'USD', destinationAccountId: mercuryBindings.MERCURY_ACCOUNT_ID,
    status: invoicePaid ? 'Paid' : 'Sent',
  });
  const harness = fixture = await createWorkerFixture(bundle, {
    bindings: mercuryBindings,
    async outbound(request) {
      const { origin, pathname } = new URL(request.url);
      expect(origin).toBe('https://api.mercury.com');
      expect(request.headers.get('Authorization')).toBe(`Bearer ${mercuryBindings.MERCURY_API_TOKEN}`);
      switch (`${request.method} ${pathname}`) {
        case 'GET /api/v1/ar/customers':
          return MockResponse.json({ customers: [{ id: customerId, email: 'buyer@example.test' }] });
        case 'POST /api/v1/ar/invoices': {
          const input = await request.json() as { invoiceNumber: string; currencyCode: string };
          orderReference = input.invoiceNumber;
          expect(input.currencyCode).toBe('USD');
          return MockResponse.json(invoice());
        }
        case `GET /api/v1/ar/invoices/${invoiceId}`:
          return MockResponse.json(invoice());
        case `GET /api/v1/ar/invoices/${invoiceId}/payments`:
          return MockResponse.json({
            payments: transfers.map(({ id, amount, status }) => ({
              id: `applied-${id}`, type: 'transaction', currencyCode: 'USD', amount,
              transaction: { id, status, kind: 'externalTransfer' },
            })),
          });
        default: {
          const transfer = transfers.find(({ id }) => request.method === 'GET' && pathname === `/api/v1/transaction/${id}`);
          if (!transfer) throw new Error(`Unexpected Mercury fixture request: ${request.method} ${pathname}`);
          return MockResponse.json({
            ...transfer, accountId: mercuryBindings.MERCURY_ACCOUNT_ID, kind: 'externalTransfer',
            postedAt: transfer.status === 'sent' ? '2025-11-26T12:00:00Z' : null, externalMemo: orderReference,
          });
        }
      }
    },
  });
  await harness.seedCatalog();
  const order = await createSampleOrder(harness, 'mercury');
  expect(order.checkoutUrl).toBe('https://app.mercury.com/pay/local-invoice-link');

  const paymentRow = () => harness.db.prepare('SELECT status, received_cents FROM orders').first();
  await harness.schedule('*/5 * * * *');
  expect(await paymentRow()).toEqual({ status: 'pending', received_cents: 0 });
  await harness.schedule('1-59/5 * * * *');
  await expectNoFulfillment(harness);

  transfers[0].status = 'sent';
  const notification = { id: 'local-ach-event', resourceType: 'transaction', resourceId: transfers[0].id };
  expect((await harness.post('/api/webhooks/mercury', notification,
    webhookHeaders('Mercury-Signature', mercuryBindings.MERCURY_WEBHOOK_SECRET, notification))).status).toBe(204);
  await expect.poll(paymentRow).toEqual({ status: 'partial', received_cents: 10_000 });
  await harness.schedule('1-59/5 * * * *');
  await expectNoFulfillment(harness);
  const tracking = await harness.post('/api/track', { orderReference: order.orderReference, token: order.trackingToken });
  expect(await tracking.json()).toMatchObject({ status: 'partial', checkoutUrl: order.checkoutUrl });

  transfers.push({ id: 'local-ach-2', amount: 201, status: 'sent' });
  invoicePaid = true;
  await harness.schedule('*/5 * * * *');
  expect(await paymentRow()).toEqual({ status: 'paid', received_cents: sampleTotalCents });
  await harness.schedule('1-59/5 * * * *');
  expect(await harness.db.prepare('SELECT status FROM fulfillment_jobs').first('status')).toBe('manual');
});

test('looks up an uncertain Stuller submission by the original purchase order without submitting again', async () => {
  const provider = stripeProvider({ liveFixture: true });
  let submitCalls = 0;
  const lookupReferences: string[] = [];
  let purchaseOrder = '';
  let visibleToLookup = false;
  const harness = fixture = await createWorkerFixture(bundle, {
    bindings: {
      ...stripeBindings, ...productionFixture, STRIPE_SECRET_KEY: 'sk_live_local_fixture',
      STULLER_ENABLED: 'true', STULLER_PACK_AND_SHIP_APPROVED: 'true',
      STULLER_USERNAME: 'local-user', STULLER_PASSWORD: 'local-password', STULLER_ACCOUNT: 'local-account',
      STULLER_ORDER_TYPE: 'local-order-type', STULLER_PAYMENT_TYPE: 'local-payment-type',
      STULLER_SHIP_METHOD_US: 'local-shipping', STULLER_APPROVED_COUNTRIES: 'US',
      STULLER_ENGRAVING_OPTIONS_JSON: JSON.stringify({
        'PRIVATE-FIXTURE': { location: 1, lineLocation: 1, type: 'local-type', font: 'local-font' },
      }),
    },
    async outbound(request) {
      const url = new URL(request.url);
      if (url.origin === 'https://api.stripe.com') return provider.outbound(request);
      expect(url.origin).toBe('https://api.stuller.com');
      expect(request.method).toBe('POST');
      if (url.pathname === '/api/v2/orders/submitorder') {
        submitCalls++;
        const order = await request.json() as { PurchaseOrderNumber: string; OrderID: string; Lines: unknown[] };
        purchaseOrder = order.PurchaseOrderNumber;
        expect(purchaseOrder).toMatch(/^CC-[A-F0-9]{32}$/);
        expect(order.OrderID).toBe(purchaseOrder);
        expect(order.Lines).toMatchObject([{
          Item: 'PRIVATE-FIXTURE', Quantity: 2, Items: [{ Engravings: [{ EngravingLine: [{ Text: ' Élan ' }] }] }],
        }]);
        // The supplier mock records receipt, then returns a gateway timeout before confirming creation.
        return new MockResponse(null, { status: 504 });
      }
      expect(url.pathname).toBe('/api/v2/orders');
      const { PurchaseOrderNumber } = await request.json() as { PurchaseOrderNumber: string[] };
      expect(PurchaseOrderNumber).toEqual([purchaseOrder]);
      lookupReferences.push(...PurchaseOrderNumber);
      return MockResponse.json({ OrderStatuses: visibleToLookup
        ? [{ PurchaseOrderNumber: purchaseOrder, OrderNumber: 'STULLER-LOCAL-01', Status: 'In Process' }]
        : [] });
    },
  });
  await harness.seedCatalog({ supplierApiApproved: true });
  await createSampleOrder(harness, 'stripe');
  provider.paid = true;
  expect((await postStripe(harness, { ...stripeWebhook, livemode: true })).status).toBe(204);

  const job = () => harness.db.prepare('SELECT status, last_error, supplier_reference FROM fulfillment_jobs').first();
  await expect.poll(job).toEqual({ status: 'reconciling', last_error: 'stuller_http_504', supplier_reference: null });
  expect(await harness.db.prepare('SELECT count(*) AS count FROM email_outbox').first('count')).toBe(0);

  const makeDue = () => harness.db.prepare("UPDATE fulfillment_jobs SET next_attempt_at = '2025-01-01T00:00:00Z'").run();
  await makeDue();
  await harness.schedule('1-59/5 * * * *');
  expect(await job()).toEqual({ status: 'reconciling', last_error: 'supplier_purchase_order_not_found', supplier_reference: null });

  visibleToLookup = true;
  await makeDue();
  await Promise.all([harness.schedule('1-59/5 * * * *'), harness.schedule('1-59/5 * * * *')]);
  expect(await job()).toEqual({ status: 'submitted', last_error: null, supplier_reference: 'STULLER-LOCAL-01' });
  expect(submitCalls).toBe(1);
  expect(lookupReferences).toEqual([purchaseOrder, purchaseOrder]);
  expect((await harness.db.prepare('SELECT kind FROM email_outbox ORDER BY kind').all()).results)
    .toEqual([{ kind: 'buyer_dispatch' }, { kind: 'merchant_dispatch' }]);
});
