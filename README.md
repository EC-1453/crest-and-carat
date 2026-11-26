# CREST & CARAT

CREST & CARAT is a jewelry storefront for Evercrest VIP LLC. Vite builds static HTML and assets for Cloudflare Pages. A separate Cloudflare Worker in `worker/` serves the commerce API and stores orders, subscriber consent and fulfillment records in D1.

## Run locally

1. Install Node.js 22.13 or newer and run `npm ci` at the repository root.
2. Copy `worker/.dev.vars.example` to `worker/.dev.vars`. Generate two independent values with `openssl rand -hex 32` and use them for `TRACKING_SECRET` and `SHIPMENT_ADMIN_SECRET`.
3. Create the local database tables.

   ```sh
   npx wrangler d1 migrations apply DB --local --config worker/wrangler.toml
   ```

4. In one terminal, start the test Worker. In a second terminal, run `npm run dev` and open `http://localhost:5173`. The Vite proxy sends API requests to Wrangler.

   ```sh
   npx wrangler dev --local --test-scheduled --port 8787 --config worker/wrangler.toml
   ```

5. Check `http://localhost:8787/api/health` and `http://localhost:8787/api/catalog`. An empty catalog and an empty processor list are expected until you configure both. The Private List and concierge forms can store submissions immediately.
6. Build and check the two deployable components.

   ```sh
   npm run build
   npx tsc --project worker/tsconfig.json
   npx wrangler deploy --dry-run --env production --config worker/wrangler.toml
   node worker/tests/commerce-smoke.mjs
   ```

## Deploy on Cloudflare's free plans

1. Run `npx wrangler login`. If Milestone 1 used a production D1 database, find its UUID in the Cloudflare dashboard and use that same database. Otherwise run `npx wrangler d1 create crest-and-carat`. In `worker/wrangler.toml`, replace the production database ID placeholder with that UUID and set its database name to the actual name. Keep the top-level test database separate.
2. Back up the existing production database if applicable. Check its migration history, then apply the Worker migrations. The first migration retains its original name and the second copies the Milestone 1 subscriber records and existing consent and forwarding timestamps into the new table.

   ```sh
   npx wrangler d1 migrations list DB --remote --env production --config worker/wrangler.toml
   npx wrangler d1 migrations apply DB --remote --env production --config worker/wrangler.toml
   ```

3. Set distinct production secrets. Keep a secure backup of the tracking secret. Replacing it invalidates existing private order links and outstanding quote and checkout request signatures.

   ```sh
   npx wrangler secret put TRACKING_SECRET --env production --config worker/wrangler.toml
   npx wrangler secret put SHIPMENT_ADMIN_SECRET --env production --config worker/wrangler.toml
   npx wrangler deploy --env production --config worker/wrangler.toml
   ```

4. Connect the repository to Cloudflare Pages. Set the build command to `npm run build`, the output directory to `dist`, and `NODE_VERSION` to `22`. Leave the root directory blank. Add `carat.evercrest.vip` as a custom domain in the Pages project. The Worker route `carat.evercrest.vip/api/*` takes API traffic on that domain. Pages serves the storefront without Functions. The static build omits the catch-all SPA rewrite in `public/_redirects` because Pages rejects it as a loop. Direct links use prerendered HTML and unknown paths return the static 404.
5. For a separate Worker hostname, use its HTTPS origin as the Pages build variable `VITE_API_BASE_URL`, then rebuild. Configure the Worker hostname in Cloudflare and keep the Worker's `STOREFRONT_ORIGIN` set to `https://carat.evercrest.vip`. Only that browser origin is allowed in production. Native Capacitor webviews use a different origin. Open the storefront in the device browser for checkout and private tracking.
6. Verify the storefront, `/api/health`, a direct product URL, the bag, the `/track-order/` page, the sitemap and robots file. Submit a test inquiry with an address you control and check D1. Verify the storefront domain in Google Search Console and submit `https://carat.evercrest.vip/sitemap.xml`.

Pages static hosting, Workers Free and D1 Free have no monthly infrastructure charge within plan limits. Resend's free transactional plan includes up to 100 emails per day and 3,000 per month. Payment processing, supplier orders, delivery and domain registration can still cost money. Native app stores have their own developer fees. Monitor usage in Cloudflare and Resend. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [Resend transactional pricing](https://resend.com/pricing?product=transactional)

## Publish a verified piece

1. Add approved exact-item images and matching product copy to the static catalog in `src/catalog-source.ts`. Keep the product slug identical in the storefront and D1.
2. In D1, enter the active version of the published `/terms/` page in `commerce_settings`. Save a dated copy of each published terms version that buyers accept. Configure approved rates in `shipping_rates` and applicable destination tax rules and disclosures in `tax_rules`. Include who pays any import charges and review those rules before enabling a destination.
3. Add a `catalog_items` row for each exact sellable SKU and variant. Verify the supplier, cost, exact variant and SKU, engraving limits and approved delivery destinations. The database requires the retail price to be at least twice the verified supplier cost. Add each permitted country to `catalog_item_destinations` and set the item and shipping rate active after review. Only set `supplier_api_approved` for exact SKUs the supplier has approved for automatic fulfillment.
4. Set up an approved hosted payment provider, transactional email and any approved automatic supplier. Run a complete controlled order before sharing storefront checkout publicly. Leave unverified settings and unapproved processors or suppliers disabled. See [payment setup](worker/src/payments/README.md) and [fulfillment setup](worker/FULFILLMENT.md).
5. Use [concierge setup](CONCIERGE_SETUP.md) for consent and optional n8n sync. See [app packaging](APP_STORE_PACKAGING.md) for native wrappers and distribution.
