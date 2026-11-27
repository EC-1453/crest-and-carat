import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { convertV4MiniflareOptions, Miniflare, Response as MockResponse, type DispatchFetch, type V4FetchHandler } from 'miniflare';
import { expect } from 'vitest';

export { MockResponse };

const repository = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);

export const stripeBindings = {
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_local_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_local_stripe_fixture',
};

export const sampleAddress = {
  fullName: 'Sample Buyer',
  line1: '100 Test Avenue',
  line2: '',
  city: 'Los Angeles',
  state: 'CA',
  postalCode: '90001',
  country: 'US',
};

export const sampleItems = [{ sku: 'TEST-RING-6', quantity: 2, engraving: ' Élan ' }];
export const sampleTotalCents = 30_100;

export interface WorkerBundle {
  directory: string;
  dispose: () => Promise<void>;
}

export async function buildWorkerBundle(): Promise<WorkerBundle> {
  const directory = await mkdtemp(join(tmpdir(), 'crest-carat-vitest-'));
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    await exec(process.execPath, [
      join(repository, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy', '--dry-run', '--config', 'worker/wrangler.toml', '--outdir', directory,
    ], { cwd: repository, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    return { directory, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

type MockOutbound = (request: Parameters<V4FetchHandler>[0]) => Promise<MockResponse> | MockResponse;

interface WorkerFixtureOptions {
  bindings?: Record<string, string>;
  outbound?: MockOutbound;
}

export async function createWorkerFixture(
  { directory }: WorkerBundle,
  { bindings, outbound }: WorkerFixtureOptions = {},
) {
  const unexpected: unknown[] = [];
  const instance = new Miniflare(convertV4MiniflareOptions({ workers: [{
    modules: true,
    modulesRoot: directory,
    scriptPath: join(directory, 'index.js'),
    compatibilityDate: '2026-11-25',
    d1Databases: { DB: 'crest-carat-vitest' },
    bindings: {
      ENVIRONMENT: 'test',
      STOREFRONT_ORIGIN: 'http://localhost:5173',
      TRACKING_SECRET: 'local-tracking-fixture-secret-00000000',
      ...bindings,
    },
    // A Node callback intercepts all Worker fetches, including hard-coded provider URLs.
    outboundService: async (request) => {
      try {
        if (!outbound) throw new Error(`Unexpected outbound request to ${new URL(request.url).hostname}`);
        return await outbound(request);
      } catch (error) {
        unexpected.push(error);
        return new MockResponse(null, { status: 500 });
      }
    },
  }] }));

  try {
    const db = await instance.getD1Database('DB');
    async function applyMigration(name: string) {
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
      const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((entry) => entry.trim()).filter(Boolean);
      await db.batch(statements.map((statement) => db.prepare(statement)));
    }
    await applyMigration('0001_subscribers.sql');
    await applyMigration('0002_commerce.sql');

    function request(path: string, init?: Parameters<DispatchFetch>[1]) {
      return instance.dispatchFetch(`http://local.test${path}`, init);
    }

    function post(path: string, payload: object, headers: Record<string, string> = {}) {
      return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      });
    }

    return {
      db,
      request,
      post,
      async schedule(cron: string) {
        const worker = await instance.getWorker();
        const result = await worker.scheduled({ cron });
        expect(result.outcome).toBe('ok');
      },
      async seedCatalog({ supplierApiApproved = false } = {}) {
        await db.batch([
          db.prepare("INSERT INTO commerce_settings VALUES (1, 'fixture-v1')"),
          db.prepare(`INSERT INTO shipping_rates VALUES ('US', 'US', 'Insured US shipping', 2000, 1),
            ('AE', 'GULF', 'Gulf Express', 4500, 1), ('GB', 'INTERNATIONAL', 'International delivery', 3500, 1)`),
          db.prepare(`INSERT INTO tax_rules VALUES ('US', 'CA', '90', 750, 1, 'Includes applicable CA sales tax.'),
            ('AE', '', '', 0, 0, 'Import VAT and duties may be charged on delivery.'),
            ('GB', '', '', 0, 0, 'Import VAT and duties may be charged on delivery.')`),
          db.prepare(`INSERT INTO catalog_items
            (sku, product_slug, variant_id, name, variant_name, price_cents, supplier_id, supplier_sku, supplier_cost_cents,
             supplier_verified_at, supplier_verification_ref, supplier_api_approved, max_quantity, engraving_mode,
             engraving_min_length, engraving_max_length, engraving_allow_letters, engraving_extra_characters,
             engraving_instructions, active)
            VALUES ('TEST-RING-6', 'test-ring', 'size-6', 'Test Ring', 'Size 6', 13000, 'stuller', 'PRIVATE-FIXTURE', 6000,
              '2025-01-01T00:00:00Z', 'Local fixture', ?, 3, 'required', 2, 20, 1, ' ', 'Enter 2 to 20 letters and spaces.', 1)`)
            .bind(Number(supplierApiApproved)),
          db.prepare(`INSERT INTO catalog_item_destinations VALUES ('TEST-RING-6', 'US'), ('TEST-RING-6', 'AE'), ('TEST-RING-6', 'GB')`),
        ]);
      },
      async dispose() {
        await instance.dispose();
        expect(unexpected).toEqual([]);
      },
    };
  } catch (error) {
    await instance.dispose();
    throw error;
  }
}

export type WorkerFixture = Awaited<ReturnType<typeof createWorkerFixture>>;

export async function createSampleOrder(fixture: WorkerFixture, processor: 'stripe' | 'mercury', email = 'buyer@example.test') {
  const input = { processor, items: sampleItems, address: sampleAddress };
  const quoteResponse = await fixture.post('/api/quote', input);
  expect(quoteResponse.status).toBe(200);
  const { quote, quoteToken } = await quoteResponse.json() as {
    quote: { currency: string; totalCents: number; termsVersion: string };
    quoteToken: string;
  };
  expect(quote).toMatchObject({ currency: 'USD', totalCents: sampleTotalCents });
  const orderResponse = await fixture.post('/api/orders', {
    ...input, quoteToken, requestId: randomUUID(), email, termsAccepted: true,
    termsVersion: quote.termsVersion, marketingOptIn: false,
  });
  expect(orderResponse.status).toBe(200);
  const order = await orderResponse.json() as {
    orderReference: string;
    trackingToken: string;
    status: string;
    checkoutState: string;
    checkoutUrl: string;
  };
  expect(order).toMatchObject({ status: 'pending', checkoutState: 'ready' });
  return order;
}

export function webhookHeaders(name: string, secret: string, payload: object): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex');
  return { [name]: `t=${timestamp},v1=${digest}` };
}
