import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const directory = await mkdtemp(join(tmpdir(), 'crest-carat-commerce-'));
const origin = 'http://localhost:5173';
const shipmentSecret = 'local-shipment-fixture-secret-00000000';
const webhookSecret = 'whsec_local_stripe_fixture';
const sessionId = 'cs_test_local_fixture';
const totalCents = 30_100;
let instance;
let providerCalls = 0;
let merchantReference;
let paid = false;
const observedEgress = [];
const mockErrors = [];

async function mockStripe(request) {
  const url = new URL(request.url);
  observedEgress.push(url.host);
  assert.equal(url.host, 'api.stripe.com');
  assert.equal(request.headers.get('Authorization'), 'Bearer sk_test_local_fixture');
  if (request.method === 'POST') {
    providerCalls++;
    const form = new URLSearchParams(await request.text());
    merchantReference = form.get('client_reference_id');
    assert.match(merchantReference, /^CC-/);
    assert.equal(form.get('metadata[order_reference]'), merchantReference);
    assert.equal(request.headers.get('Idempotency-Key'), `crest-carat-checkout-${merchantReference}`);
    assert.equal(new URL(form.get('success_url')).origin, origin);
    assert.match(new URL(form.get('success_url')).hash, /token=[a-f0-9]{64}$/);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '26000');
    assert.equal(form.get('line_items[1][price_data][unit_amount]'), '2000');
    assert.equal(form.get('line_items[2][price_data][unit_amount]'), '2100');
  } else {
    assert.equal(url.pathname, `/v1/checkout/sessions/${sessionId}`);
  }
  return Response.json({
    id: sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}`, mode: 'payment', currency: 'usd',
    livemode: false, amount_total: totalCents, client_reference_id: merchantReference,
    metadata: { order_reference: merchantReference },
    status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid',
    payment_intent: paid ? {
      status: 'succeeded', currency: 'usd', livemode: false, amount: totalCents,
      amount_received: totalCents, metadata: { order_reference: merchantReference },
    } : null,
  });
}

try {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
    '--config', 'worker/wrangler.toml', '--outdir', directory], { stdio: 'pipe' });
  instance = new Miniflare(convertV4MiniflareOptions({ workers: [{
    modules: true,
    scriptPath: join(directory, 'index.js'),
    modulesRoot: directory,
    compatibilityDate: '2026-11-25',
    d1Databases: { DB: 'crest-carat-smoke' },
    bindings: {
      ENVIRONMENT: 'test', STOREFRONT_ORIGIN: origin,
      TRACKING_SECRET: 'local-order-signing-fixture-secret-00000000',
      SHIPMENT_ADMIN_SECRET: shipmentSecret,
      STRIPE_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_local_fixture', STRIPE_WEBHOOK_SECRET: webhookSecret,
      NICKEL_ENABLED: 'true', STULLER_ENABLED: 'true',
      N8N_WEBHOOK_URL: 'https://example.invalid/workflow', N8N_WEBHOOK_SECRET: 'unused',
    },
    outboundService: async (request) => {
      try {
        return await mockStripe(request);
      } catch (error) {
        mockErrors.push(String(error));
        return new Response(null, { status: 500 });
      }
    },
  }] }));
  const db = await instance.getD1Database('DB');

  async function exec(sql) {
    const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
  await exec(await readFile(new URL('../migrations/0001_subscribers.sql', import.meta.url), 'utf8'));
  await exec(`INSERT INTO subscriber_events (request_id, source, email, name, product_slug, created_at, marketing_consented_at)
    VALUES ('legacy', 'checkout', 'old@example.test', 'Existing Client', 'test-ring', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`);
  await exec(await readFile(new URL('../migrations/0002_commerce.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await db.prepare('SELECT marketing_opt_in, interest_category FROM subscribers WHERE request_id = ?')
    .bind('legacy').first(), { marketing_opt_in: 1, interest_category: 'test-ring' });

  const send = (path, init) => instance.dispatchFetch(`http://local.test/api/${path}`, init);
  const post = (path, payload, extra = {}) => send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(payload),
  });
  async function json(response, status = 200) {
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value;
  }

  assert.deepEqual(await json(await send('health')), { ok: true, environment: 'test' });
  assert.equal((await send('missing')).status, 404);
  assert.equal((await send('orders')).status, 405);
  assert.equal((await send('catalog', { headers: { Origin: 'https://other.example' } })).status, 403);
  const preflight = await send('orders', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual((await json(await send('catalog'))).processors, []);

  const subscriber = {
    requestId: randomUUID(), source: 'inquiry', email: 'Guest@EXAMPLE.TEST', name: 'Sample Guest',
    message: 'I am interested in the ring.', marketingConsent: false, sourcePage: '/contact/', interestCategory: 'fine-jewelry',
  };
  assert.deepEqual(await json(await post('subscribers', subscriber)), { saved: true, forwarding: 'manual' });
  assert.deepEqual(await json(await post('subscribers', subscriber)), { saved: true, forwarding: 'manual' });
  await json(await post('subscribers', { ...subscriber, message: 'Different details' }), 409);
  await json(await post('subscribers', { ...subscriber, source: 'vip', requestId: randomUUID() }), 400);
  await json(await post('subscribers', { ...subscriber, source: 'vip', requestId: randomUUID(), marketingConsent: true }));
  const inquiry = await db.prepare('SELECT * FROM subscribers WHERE request_id = ?').bind(subscriber.requestId).first();
  assert.equal(inquiry.email, 'Guest@example.test');
  assert.equal(inquiry.n8n_synced, 0);
  assert.equal(inquiry.consent_timestamp, null);
  assert.equal(inquiry.interest_category, 'fine-jewelry');

  await exec(`
    INSERT INTO commerce_settings VALUES (1, 'fixture-v1');
    INSERT INTO shipping_rates VALUES ('US', 'US', 'Insured US shipping', 2000, 1),
      ('AE', 'GULF', 'Gulf Express', 4500, 1), ('GB', 'INTERNATIONAL', 'International delivery', 3500, 1);
    INSERT INTO tax_rules VALUES ('US', 'CA', '90', 750, 1, 'Includes applicable CA sales tax.'),
      ('AE', '', '', 0, 0, 'Import VAT and duties may be charged on delivery.'),
      ('GB', '', '', 0, 0, 'Import VAT and duties may be charged on delivery.');
    INSERT INTO catalog_items
      (sku, product_slug, variant_id, name, variant_name, price_cents, supplier_id, supplier_sku, supplier_cost_cents,
       supplier_verified_at, supplier_verification_ref, max_quantity, engraving_mode, engraving_min_length,
       engraving_max_length, engraving_allow_letters, engraving_extra_characters, engraving_instructions, active)
    VALUES ('TEST-RING-6', 'test-ring', 'size-6', 'Test Ring', 'Size 6', 13000, 'stuller', 'PRIVATE-OFFER', 6000,
      '2025-01-01T00:00:00Z', 'Local fixture', 3, 'required', 2, 20, 1, ' é', 'Enter 2 to 20 letters and spaces.', 1);
    INSERT INTO catalog_item_destinations VALUES ('TEST-RING-6', 'US'), ('TEST-RING-6', 'AE'), ('TEST-RING-6', 'GB');
  `);
  const catalog = await json(await send('catalog'));
  assert.deepEqual(catalog.processors.map(({ id }) => id), ['stripe']);
  assert.equal(catalog.items[0].variantId, 'size-6');
  assert(!JSON.stringify(catalog).includes('PRIVATE-OFFER'));

  const input = {
    processor: 'stripe',
    items: [{ sku: 'TEST-RING-6', quantity: 2, engraving: ' Élan ' }],
    address: { fullName: 'Sample Guest', line1: '100 Test Avenue', line2: '', city: 'Los Angeles', state: 'CA', postalCode: '90001', country: 'US' },
  };
  await json(await post('quote', { ...input, processor: 'nickel' }), 503);
  await json(await post('quote', { ...input, items: [{ ...input.items[0], engraving: 'Disallowed#' }] }), 400);
  await json(await post('quote', { ...input, items: [input.items[0], input.items[0]] }), 422);
  const { quote, quoteToken } = await json(await post('quote', input));
  assert.equal(quote.totalCents, totalCents);
  assert.equal(quote.items[0].engraving, ' Élan ');
  assert(!JSON.stringify(quote).includes('PRIVATE-OFFER'));
  for (const [country, region, shippingCents] of [['AE', 'GULF', 4500], ['GB', 'INTERNATIONAL', 3500]]) {
    const result = await json(await post('quote', { ...input, address: { ...input.address, country, state: '', postalCode: '' } }));
    assert.equal(result.quote.shippingRegion, region);
    assert.equal(result.quote.shippingCents, shippingCents);
    assert.match(result.quote.taxDisclosure, /Import VAT/);
  }

  const orderInput = {
    ...input, quoteToken, requestId: randomUUID(), email: 'buyer@example.test', termsAccepted: true,
    termsVersion: quote.termsVersion, marketingOptIn: true,
  };
  await json(await post('orders', { ...orderInput, termsAccepted: false }), 400);
  await json(await post('orders', { ...orderInput, quoteToken: 'invalid' }), 409);
  await db.prepare("UPDATE catalog_items SET price_cents = 14000 WHERE sku = 'TEST-RING-6'").run();
  await json(await post('orders', orderInput), 409);
  await db.prepare("UPDATE catalog_items SET price_cents = 13000 WHERE sku = 'TEST-RING-6'").run();

  const first = await Promise.all([post('orders', orderInput), post('orders', orderInput)]);
  const results = await Promise.all(first.map((response) => json(response)));
  assert.equal(results[0].orderReference, results[1].orderReference);
  const order = await json(await post('orders', orderInput));
  assert.equal(order.status, 'pending');
  assert.equal(order.checkoutState, 'ready', JSON.stringify({
    egress: observedEgress, mockErrors,
    events: (await db.prepare('SELECT status, detail FROM payment_events').all()).results,
  }));
  assert.match(order.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(providerCalls, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
  assert.equal((await db.prepare('SELECT engraving FROM order_items').first()).engraving, ' Élan ');
  assert.equal((await db.prepare("SELECT marketing_opt_in FROM subscribers WHERE source = 'buyer'").first()).marketing_opt_in, 1);
  assert((await db.prepare('SELECT terms_accepted_at FROM orders').first()).terms_accepted_at);
  await json(await post('orders', { ...orderInput, email: 'different@example.test' }), 409);

  const tracking = { orderReference: order.orderReference, token: order.trackingToken };
  await json(await post('track', { orderReference: order.orderReference }), 404);
  await json(await post('track', { ...tracking, token: '0'.repeat(64) }), 404);
  assert.deepEqual(await json(await post('track', tracking)), {
    orderReference: order.orderReference, status: 'pending', shipments: [], checkoutUrl: order.checkoutUrl,
  });
  assert((await send('webhooks/mercury', { method: 'POST' })).status >= 400);
  assert((await send('webhooks/cards', { method: 'POST' })).status >= 400);
  assert((await send('webhooks/airwallex', { method: 'POST' })).status >= 400);

  const webhook = { id: 'evt_test_local_fixture', livemode: false, type: 'checkout.session.completed', data: { object: { id: sessionId } } };
  const signWebhook = (secret) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(webhook)}`).digest('hex');
    return `t=${timestamp},v1=${digest}`;
  };
  assert.equal((await post('webhooks/stripe', webhook, { 'Stripe-Signature': signWebhook('wrong') })).status, 401);
  paid = true;
  const hook = () => post('webhooks/stripe', webhook, { 'Stripe-Signature': signWebhook(webhookSecret) });
  const webhookResults = await Promise.all([hook(), hook(), hook()]);
  assert(webhookResults.every((response) => response.ok), webhookResults.map(({ status }) => status).join(', '));
  assert.equal((await json(await post('track', tracking))).status, 'paid');

  let manualJob;
  for (let attempt = 0; attempt < 40 && !manualJob; attempt++) {
    manualJob = await db.prepare('SELECT merchant_reference FROM fulfillment_jobs WHERE status = ?').bind('manual').first();
    if (!manualJob) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert(manualJob);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM fulfillment_jobs').first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'manual_fulfillment'").first()).n, 1);
  const shipment = { merchantReference: manualJob.merchant_reference, carrier: 'UPS', trackingNumber: '1ZTESTTRACKING' };
  await json(await post('admin/shipments', shipment), 401);
  const auth = { Authorization: `Bearer ${shipmentSecret}` };
  await json(await post('admin/shipments', shipment, auth));
  await json(await post('admin/shipments', shipment, auth));
  const shipmentEmail = await db.prepare("SELECT payload_json FROM email_outbox WHERE kind = 'shipment'").first();
  assert(shipmentEmail);
  const { html, text } = JSON.parse(shipmentEmail.payload_json);
  assert(text.endsWith('CREST & CARAT™ © ALL RIGHTS RESERVED'));
  assert.match(html, /<footer>[\s\S]*CREST &amp; CARAT™ © ALL RIGHTS RESERVED[\s\S]*<\/footer>/);
  const tracked = await json(await post('track', tracking));
  assert.equal(tracked.checkoutUrl, null);
  assert.equal(tracked.shipments.length, 1);
  assert.equal(tracked.shipments[0].trackingNumber, shipment.trackingNumber);
  assert(!JSON.stringify(tracked).includes('100 Test Avenue'));
  assert(observedEgress.every((host) => host === 'api.stripe.com'));
  console.log('Commerce smoke passed with local D1, mocked Stripe, subscriber consent, quotes, checkout, fulfillment and private tracking.');
} finally {
  await instance?.dispose();
  await rm(directory, { recursive: true, force: true });
}
