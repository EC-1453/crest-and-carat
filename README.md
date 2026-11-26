# crest-and-carat

CREST & CARAT is a React and TypeScript storefront for Evercrest VIP LLC. Vite builds the frontend, then React renders each public route to static HTML. Cloudflare Pages serves those pages, and Pages Functions use D1 for concierge and private-list submissions.

## Run locally

1. Install Node.js 22.13 or newer. Run `npm ci` at the repository root.
2. Copy `.env.example` to `.env.local` if you have a verified business address, support alias, Search Console token, or live app store links. The defaults work without those values.
3. Run `npm run dev` to edit the site. Run `npm run build` to check types and generate the production site in `dist/`.
4. For a production-like test, add the D1 binding using [concierge setup](CONCIERGE_SETUP.md). Run `npx wrangler d1 migrations apply SUBSCRIBERS_DB --local`, then `npm run pages:dev`.

## Deploy on the Cloudflare Pages free tier

1. Push the source to your GitHub repository. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
2. Use **None** as the framework preset. Enter `npm run build` as the build command, `dist` as the output directory, and `22` for `NODE_VERSION`. Leave the root directory blank for this repository.
3. Add the public settings you use from `.env.example` under the Pages project’s environment variables. Set runtime secrets directly in the Pages project. Add the `SUBSCRIBERS_DB` binding and apply the SQL migration using [concierge setup](CONCIERGE_SETUP.md). Deploy again after changing a binding or build variable.
4. In the Pages project, open **Custom domains → Set up a custom domain** and add `carat.evercrest.vip`. Follow Cloudflare’s DNS instructions. The build uses this canonical domain in the sitemap and page metadata.
5. Visit a collection, a product, and an invented URL directly on the custom domain. Confirm the first two return 200 and the last returns 404. Submit a test inquiry and confirm D1 recorded it. Verify the domain in Google Search Console and submit `https://carat.evercrest.vip/sitemap.xml`.

Pages and D1 can run without a monthly infrastructure fee within their free-tier limits. Local development and the PWA require no store account. Apple and Google may charge developer account fees when you publish native apps, and payment providers typically charge per transaction. See [app packaging](APP_STORE_PACKAGING.md).

## Publish a verified piece

1. Edit the private catalog in `src/catalog-source.ts`. Record the verified supplier and exact SKU, current cost in USD, retail price, destinations, production time, carrier transit terms, materials and dimensions, and the supplier’s exact personalization rules.
2. Add the approved exact-item images under `public/images/`. Enter their paths, image dimensions, and accurate description. Confirm the hosted checkout integration, including its shipping terms and the precise final-sale notice.
3. Enable `buyAndPersonalizeEnabled` only after completing the record and checkout setup. The build rejects sellable records with missing verification or a price below twice verified supplier cost. The public output omits supplier cost, internal SKU, and planning price. Current launch pieces are inquiries.
4. Set the checkout adapter’s HTTPS URL with `CHECKOUT_SESSION_WEBHOOK_URL` and its required bearer secret with `CHECKOUT_SESSION_WEBHOOK_TOKEN`. The endpoint receives the verified supplier references, piece and shipping amounts in USD cents, selected options, contact email, and final-sale acknowledgment. Configure it to enforce the destination, deduplicate using `Idempotency-Key`, and return a JSON object with a `url` on the approved checkout origin. Test a complete order before enabling the piece. Verify that the identical USD item price appears on the site, in the checkout, and in the Merchant Center feed.

The default checkout, availability, order-status and form requests stay online. The service worker caches public static resources and serves a dedicated offline page. See [app packaging](APP_STORE_PACKAGING.md) for association files, native signing and distribution.
