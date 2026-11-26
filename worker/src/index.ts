import { CatalogError, getCatalog } from './catalog';
import { recordShipment, ShipmentInputError, sweepFulfillment, type FulfillmentEnv } from './fulfillment';
import { createOrder, quoteOrder, trackOrder } from './orders';
import { handlePaymentWebhook, paymentProcessors, reconcilePayments, type PaymentEnv, type ProcessorName } from './payments';
import { ApiError, hasSigningSecret, readJson, secretsEqual, type SecurityEnv } from './security';
import { forwardSubscriber, saveSubscriber, syncSubscribers, type SubscriberEnv } from './subscribers';

interface Env extends FulfillmentEnv, PaymentEnv, SecurityEnv, SubscriberEnv {
  SHIPMENT_ADMIN_SECRET?: string;
}

const productionOrigin = 'https://carat.evercrest.vip';

function clientOrigin(env: Env): string | null {
  if (env.ENVIRONMENT === 'production') return env.STOREFRONT_ORIGIN === productionOrigin ? productionOrigin : null;
  if (env.ENVIRONMENT !== 'test') return null;
  try {
    const url = new URL(env.STOREFRONT_ORIGIN);
    return url.origin === env.STOREFRONT_ORIGIN &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      ? url.origin : null;
  } catch {
    return null;
  }
}

function reply(body: object | null, status: number, origin?: string, allow?: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
  });
  if (body) headers.set('Content-Type', 'application/json; charset=utf-8');
  if (allow) headers.set('Allow', allow);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (status === 204 && origin && allow) {
    headers.set('Access-Control-Allow-Methods', allow);
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

function failure(error: unknown, origin?: string): Response {
  if (error instanceof ApiError || error instanceof CatalogError || error instanceof ShipmentInputError) {
    return reply({ error: error.message }, error.status, origin);
  }
  return reply({ error: 'The service is temporarily unavailable. Please try again.' }, 503, origin);
}

const routes = {
  '/api/health': 'GET',
  '/api/catalog': 'GET',
  '/api/quote': 'POST',
  '/api/orders': 'POST',
  '/api/track': 'POST',
  '/api/subscribers': 'POST',
} as const;

const processorWebhooks = new Map<string, ProcessorName>([
  ['/api/webhooks/mercury', 'mercury'],
  ['/api/webhooks/cards', 'helcim'],
  ['/api/webhooks/stripe', 'stripe'],
  ['/api/webhooks/airwallex', 'airwallex'],
] as const);

async function ingestShipment(env: Env, request: Request): Promise<Response> {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405, undefined, 'POST');
  const expected = env.SHIPMENT_ADMIN_SECRET;
  const authorization = request.headers.get('Authorization');
  if (!expected || expected.length < 32 || !authorization?.startsWith('Bearer ') ||
      !(await secretsEqual(authorization.slice(7), expected))) {
    return reply({ error: 'Unauthorized.' }, 401);
  }
  const { merchantReference, carrier, trackingNumber, trackingUrl } = await readJson(request, 4096);
  if (typeof merchantReference !== 'string' || typeof carrier !== 'string' || typeof trackingNumber !== 'string' ||
      (trackingUrl !== undefined && typeof trackingUrl !== 'string')) {
    throw new ApiError('Enter a merchant reference, carrier and tracking number.');
  }
  await recordShipment(env, { merchantReference, carrier, trackingNumber, trackingUrl });
  return reply({ saved: true }, 200);
}

async function fetchApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const allowedOrigin = clientOrigin(env);
  if (!allowedOrigin || !env.DB) return reply({ error: 'The service is temporarily unavailable.' }, 503);
  const origin = request.headers.get('Origin');
  if ((origin && origin !== allowedOrigin) || (!origin && request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
    return reply({ error: 'Forbidden.' }, 403);
  }

  const webhookProcessor = processorWebhooks.get(path);
  if (webhookProcessor) {
    if (origin) return reply({ error: 'Forbidden.' }, 403);
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405, undefined, 'POST');
    if (Number(request.headers.get('Content-Length')) > 131_072) return reply({ error: 'Request is too large.' }, 413);
    try {
      const response = await handlePaymentWebhook(request, env, webhookProcessor,
        (work) => ctx.waitUntil(work.then(() => sweepFulfillment(env))));
      if (response.ok && webhookProcessor !== 'mercury' && webhookProcessor !== 'airwallex') ctx.waitUntil(sweepFulfillment(env));
      return response;
    } catch (error) {
      return failure(error);
    }
  }
  if (path === '/api/admin/shipments') {
    if (origin) return reply({ error: 'Forbidden.' }, 403);
    try {
      return await ingestShipment(env, request);
    } catch (error) {
      return failure(error);
    }
  }

  const corsOrigin = origin === allowedOrigin ? allowedOrigin : undefined;
  if (!Object.hasOwn(routes, path)) return reply({ error: 'Route not found.' }, 404, corsOrigin);
  const method = routes[path as keyof typeof routes];
  const allow = `${method}, OPTIONS`;
  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers.get('Access-Control-Request-Method');
    const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
    if (!corsOrigin || requestedMethod !== method ||
        requestedHeaders?.split(',').some((header) => header.trim().toLowerCase() !== 'content-type')) {
      return reply({ error: 'Forbidden.' }, 403);
    }
    return reply(null, 204, corsOrigin, allow);
  }
  if (request.method !== method) return reply({ error: 'Method not allowed.' }, 405, corsOrigin, allow);

  try {
    switch (path) {
      case '/api/health':
        await env.DB.prepare('SELECT 1 FROM commerce_settings LIMIT 1').all();
        return reply({ ok: true, environment: env.ENVIRONMENT }, 200, corsOrigin);
      case '/api/catalog': {
        const catalog = await getCatalog(env.DB);
        const processors = hasSigningSecret(env) && catalog.termsVersion && catalog.items.length && catalog.shipping.length
          ? paymentProcessors(env) : [];
        return reply({ ...catalog, processors }, 200, corsOrigin);
      }
      case '/api/quote':
        return reply(await quoteOrder(env, request), 200, corsOrigin);
      case '/api/orders':
        return reply(await createOrder(env, request), 200, corsOrigin);
      case '/api/track':
        return reply(await trackOrder(env, request), 200, corsOrigin);
      case '/api/subscribers': {
        const submission = await saveSubscriber(env, request);
        let delivered = false;
        try {
          delivered = await forwardSubscriber(env, submission);
        } catch {
          // D1 already holds the durable submission for the next sync.
        }
        return reply({ saved: true, forwarding: delivered ? 'delivered' : 'manual' }, 200, corsOrigin);
      }
      default:
        return reply({ error: 'Route not found.' }, 404, corsOrigin);
    }
  } catch (error) {
    return failure(error, corsOrigin);
  }
}

export default {
  fetch: fetchApi,
  scheduled(controller, env, ctx) {
    if (!clientOrigin(env) || !env.DB) return;
    switch (controller.cron) {
      case '*/5 * * * *':
        ctx.waitUntil(reconcilePayments(env));
        break;
      case '1-59/5 * * * *':
        ctx.waitUntil(sweepFulfillment(env));
        break;
      case '2-59/5 * * * *':
        ctx.waitUntil(syncSubscribers(env));
        break;
    }
  },
} satisfies ExportedHandler<Env>;
