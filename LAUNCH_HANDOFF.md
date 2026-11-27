# CREST & CARAT launch handoff

## 1. Verify the release locally

From the repository root, use Node.js 22.13 or newer and run the following commands. The tests use local data and simulated provider responses. Keep production credentials out of the test environment.

```sh
npm ci
npm test
npm run build
npx tsc --project worker/tsconfig.json
npx wrangler d1 migrations apply DB --local --config worker/wrangler.toml
npx wrangler deploy --dry-run --env production --config worker/wrangler.toml
```

`npm test` builds the storefront in `dist/`, runs Vitest, and runs the existing local commerce smoke test. Milestone 3 also checked the Cloudflare Pages preview build and tested Chromium at 320, 390, 768, and 1440 pixels, including the real HTTP 404 and offline fallback. Production deployment, account approvals, and Search Console ownership require access to the relevant accounts.

## 2. Configure Cloudflare Pages

1. In **Workers & Pages → Create → Pages → Connect to Git**, select `EC-1453/crest-and-carat`. Use these settings.

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Root directory | Leave blank for the repository root |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Build variable `NODE_VERSION` | `22` |
   | Build variable `VITE_API_BASE_URL` | Leave unset for the same-origin Worker at `/api/*` |
   | Build variable `CARAT_PUBLISH_VERIFIED_OFFERS` | Leave unset for the current inquiry-only catalog |

2. Under **Custom domains**, add `carat.evercrest.vip` to the Pages project. Wait for the domain and HTTPS certificate to become active. Use the proxied DNS record in the Cloudflare zone `evercrest.vip` so the Worker route can handle API requests. Leave payment and email credentials in Workers Secrets.
3. Deploy the static files from `dist/` as generated. The build produces prerendered HTML, `404.html`, `_headers`, `robots.txt`, `sitemap.xml`, and `merchant-feed.xml`. The build excludes the source catch-all SPA rewrite so direct routes serve their own HTML and missing pages return HTTP 404. Pages preview branch builds add `noindex` in HTML and response headers. [Pages build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/) · [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)

## 3. Create D1 and deploy the Worker

1. Sign in and confirm that Wrangler is connected to the Cloudflare account that manages the Pages project and DNS zone.

   ```sh
   npx wrangler login
   npx wrangler whoami
   ```

2. Confirm the Cloudflare account contains the production D1 database `crest-and-carat-db` with ID `c73b3d5d-0976-4640-9fcb-e514badfb246`. The Worker already binds it as `DB` in `worker/wrangler.toml`. Keep the separate test binding for local development.

   For a fresh deployment in an account without this database, create it and set that account's database name and ID under `[[env.production.d1_databases]]`. Preserve an existing subscriber database if it already has production data.

   ```sh
   npx wrangler d1 create crest-and-carat-db --no-update-config --config worker/wrangler.toml
   ```

3. If the production database already has data, check its migration history and save an export in a secure location outside the repository. The first Worker migration shares the Milestone 1 migration name. The next migration copies archived subscriber and consent data into `subscribers`. Check that an existing `subscriber_events` table has the expected migration history before applying changes.

   ```sh
   npx wrangler d1 migrations list DB --remote --env production --config worker/wrangler.toml
   npx wrangler d1 export DB --remote --output "$PWD/../crest-and-carat-d1-backup.sql" --env production --config worker/wrangler.toml
   ```

4. Apply the production migrations and check the list of remaining migrations.

   ```sh
   npx wrangler d1 migrations apply DB --remote --env production --config worker/wrangler.toml
   npx wrangler d1 migrations list DB --remote --env production --config worker/wrangler.toml
   ```

   To apply the migrations to a fresh local D1 database, run `npx wrangler d1 migrations apply DB --local --config worker/wrangler.toml`. [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

5. Deploy `crest-and-carat-api` with third-party payment, supplier, email, and n8n integrations disabled for the first production setup. If the Worker already exists, check its current settings and queue before deploying an update. Add the core Worker secrets listed below. Then redeploy after any Wrangler configuration changes.

   ```sh
   npx wrangler deploy --env production --config worker/wrangler.toml
   npx wrangler secret put TRACKING_SECRET --env production --config worker/wrangler.toml
   npx wrangler secret put SHIPMENT_ADMIN_SECRET --env production --config worker/wrangler.toml
   npx wrangler deploy --env production --config worker/wrangler.toml
   ```

   Keep `STOREFRONT_ORIGIN = "https://carat.evercrest.vip"` and the route `carat.evercrest.vip/api/*`. The same deploy registers these UTC schedules from `[env.production.triggers]`. Check the three triggers in **Workers & Pages → crest-and-carat-api → Settings → Trigger Events**, then open **View events** to confirm successful executions. Allow up to 15 minutes for trigger changes to take effect. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

   | Cron expression | Runs |
   | --- | --- |
   | `*/5 * * * *` | Reconcile payments |
   | `1-59/5 * * * *` | Process fulfillment, shipment lookups, and email |
   | `2-59/5 * * * *` | Retry subscriber forwarding to n8n |

## 4. Set Worker secrets and complete account approvals

Run `npx wrangler secret put NAME --env production --config worker/wrangler.toml` once for each name in the **Worker secrets** column for an integration you are activating. Paste the value at the prompt. Each command deploys a Worker version immediately, so finish adding credentials before turning on the integration's enable flags. List configured names with `npx wrangler secret list --env production --config worker/wrangler.toml`. [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

| Integration | Worker secrets | Wrangler variables and approvals to confirm |
| --- | --- | --- |
| Core order security | `TRACKING_SECRET`, `SHIPMENT_ADMIN_SECRET` | Generate two independent values of at least 32 characters with `openssl rand -hex 32`. Store backups securely. Retain the tracking secret across deploys because changing it invalidates outstanding signatures and private order links. |
| Mercury | `MERCURY_API_TOKEN`, `MERCURY_WEBHOOK_SECRET` | Set `MERCURY_ACCOUNT_ID`. Confirm the merchant USD account, hosted ACH and wire access, and approved egress IP. Set `MERCURY_ENABLED`, `MERCURY_TRANSFER_APPROVED`, and `MERCURY_EGRESS_APPROVED` to `"true"` only after approval. Use `MERCURY_ACH_DEBIT_ENABLED` only if the account has separate ACH Debit approval. Keep Mercury off if suitable approved egress is unavailable. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Activate the merchant account and hosted USD Checkout. Configure the live webhook and confirm any wallet or international card methods you intend to offer. Then set `STRIPE_ENABLED = "true"`. |
| Airwallex | `AIRWALLEX_API_KEY`, `AIRWALLEX_WEBHOOK_SECRET` | Set `AIRWALLEX_CLIENT_ID` and `AIRWALLEX_ACCOUNT_ID`. Confirm live Checkout Sessions access, Checkout Session read/write and Payment Intent read permissions, and the webhook version and events in the payment setup guide. Then set `AIRWALLEX_ENABLED = "true"`. |
| Relay | `RELAY_BRIDGE_URL`, `RELAY_BRIDGE_TOKEN` | Set `RELAY_HOSTED_ORIGIN` to the verified HTTPS origin. Activate merchant Quick Requests and provide the authenticated, merchant-operated bridge in the payment setup guide. Use a token of at least 32 characters. Then set `RELAY_ENABLED = "true"`. Reconciliation runs on Cron. |
| Helcim | `HELCIM_API_TOKEN`, `HELCIM_WEBHOOK_SECRET` | Set `HELCIM_HOSTED_ORIGIN` to the account's verified HTTPS origin. Confirm approved USD Online Invoice View payments and the signed webhook. Set `HELCIM_ENABLED = "true"` after approval. Set `HELCIM_ACH_ENABLED = "true"` only after confirming hosted US ACH and ACH read access. |
| Stuller | `STULLER_USERNAME`, `STULLER_PASSWORD`, `STULLER_ACCOUNT` | Secure trade account and production Pack & Ship Order API approval for exact SKUs, countries, engraving, and shipment terms. Configure `STULLER_ORDER_TYPE`, `STULLER_PAYMENT_TYPE`, `STULLER_APPROVED_COUNTRIES`, and `STULLER_SHIP_METHOD_US` and/or `STULLER_SHIP_METHOD_INTERNATIONAL` as applicable. Set `STULLER_ENGRAVING_OPTIONS_JSON` for engraved SKUs. `STULLER_DISPATCH_EMAIL` is optional. Set `STULLER_ENABLED` and `STULLER_PACK_AND_SHIP_APPROVED` to `"true"` only after approval. |
| Transactional email | `RESEND_API_KEY` for Resend. Existing optional adapters use `POSTMARK_SERVER_TOKEN` or `MAILCHANNELS_API_KEY` with their corresponding account. | For the free-tier setup, verify the sending domain in Resend, set `EMAIL_PROVIDER = "resend"` and disable link tracking for private links. Keep `SENDER_EMAIL = "privateclient@evercrest.vip"` and `SUPPORT_EMAIL = "support@evercrest.vip"` under `[env.production.vars]`. Confirm both email addresses receive mail. |
| n8n | `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | Optional. Activate a production HTTPS webhook on an existing n8n Community Edition host, enable bearer authentication, and deduplicate by request ID. Filter mailing-list events for explicit consent. D1 captures submissions independently. |
| Nickel | None | Keep `NICKEL_ENABLED = "false"`. The repository has no enabled Nickel checkout adapter. |

`SENDER_EMAIL` is a public address and is already configured. If you require it to be stored as a secret, remove the `SENDER_EMAIL` assignment under `[env.production.vars]` and deploy that configuration, then run `npx wrangler secret put SENDER_EMAIL --env production --config worker/wrangler.toml` and paste `privateclient@evercrest.vip`. The Worker uses that same address as its default during setup.

Set the companion variables in `[env.production.vars]` and deploy from the repository root. Register approved payment webhooks at `https://carat.evercrest.vip/api/webhooks/stripe`, `/api/webhooks/mercury`, `/api/webhooks/airwallex`, or `/api/webhooks/cards` for the corresponding provider. Use the events and verification requirements in the provider setup guide. [Hosted payments](worker/src/payments/README.md) · [Fulfillment and email](worker/FULFILLMENT.md) · [Concierge and n8n](CONCIERGE_SETUP.md)

Cloudflare Pages, Workers, D1, and Resend can run within their free-tier limits. Payment processing, supplier orders, shipping, and domain registration can incur separate charges. [Workers quotas](https://developers.cloudflare.com/workers/platform/limits/) · [D1 free plan limits](https://developers.cloudflare.com/d1/platform/pricing/) · [Resend pricing](https://resend.com/pricing)

## 5. Confirm the catalog before live sales

| Product | Slug | Storefront status | Live production purchase verification | Evidence needed before activation |
| --- | --- | --- | --- | --- |
| The Sovereign | `the-sovereign` | Inquiry only | Unverified | Exact 14K nameplate SKU, lettering and character rules |
| The Aurelia | `the-aurelia` | Inquiry only | Unverified | Exact natural diamond, weight, grading details, and setting |
| The Seraphina | `the-seraphina` | Inquiry only | Unverified | Exact freshwater pearl and gold components, engraving rules, and one-package assembly and shipping |
| The Monarch | `the-monarch` | Inquiry only | Unverified | Exact 14K signet, approved ring sizes, and monogram rules |
| The Celeste | `the-celeste` | Inquiry only | Unverified | Exact moissanite and vermeil construction, length, and product specifications |
| The Royal Coordinate | `the-royal-coordinate` | Inquiry only | Unverified | Exact 14K piece, engraving surface, and supplier-approved coordinate format |
| The Aurum Chain | `the-aurum-chain` | Design study | Unverified | Exact 18K solid gold link construction, weight, dimensions, and clasp |
| The Empire Cuff | `the-empire-cuff` | Design study | Unverified | Exact 22K solid gold construction, weight, and wrist fit |
| The Estelle Solitaire | `the-estelle-solitaire` | Design study | Unverified | Exact natural diamond, GIA grading report, and Platinum 950 setting |
| The Lumière Rivière | `the-lumiere-riviere` | Design study | Unverified | Natural diamond schedule, principal stone's GIA report, and 18K white gold setting |
| The Imperial Ruby | `the-imperial-ruby` | Design study | Unverified | Exact natural ruby, origin and treatment report, and applicable import eligibility |
| The Verde Emerald | `the-verde-emerald` | Design study | Unverified | Exact natural emerald, provenance and treatment report, and 18K gold setting |
| The Royal Sapphire | `the-royal-sapphire` | Design study | Unverified | Exact natural sapphire, lab report and treatment disclosure, and Platinum 950 setting |
| The Solstice South Sea | `the-solstice-south-sea` | Design study | Unverified | Exact cultured South Sea pearl pair, treatment disclosures, and 18K gold mounts |
| The Lune Akoya | `the-lune-akoya` | Design study | Unverified | Exact cultured Akoya strand, sourcing and treatment disclosures, and 18K white gold clasp |

The six original pieces and nine high jewelry design studies accept inquiries through the Private Concierge Dossier. The design studies display indicative starting estimates for commissions. Live prices require confirmation for the exact piece. Checkout, Product/Offer markup, and merchant-feed entries require approved live offers. The commerce suite uses fixture SKUs, isolated D1, and simulated provider responses. Live SKU availability, settlement, supplier acceptance, and order delivery remain unverified for all 15 pieces.

1. Confirm the exact piece and variant in the dossier. Include metal and purity, the selected stone and any applicable origin, treatment and grading report, approved images, engraving specifications, availability, and delivery terms. Obtain the verified supplier cost and exact SKU before adding the approved storefront record to `src/catalog-source.ts`. Configure matching D1 SKUs, eligible destinations, insured rates, tax and import-charge disclosures, and the current terms version. Review delivery separately for the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, and Oman before enabling any of those destinations.
2. Confirm an approved hosted payment method and transactional email. Keep `supplier_api_approved` off until the supplier approves automation for that SKU. Complete a separate, authorized provider and supplier acceptance check before making the piece publicly orderable.
3. After deployment, confirm the storefront and `/api/health` return HTTP 200, an invented path returns 404, and `/api/catalog` contains only explicitly approved items and processors. Check that the sitemap, robots file, and merchant feed load. Confirm `noindex` on preview and private commerce pages. Submit a Private List signup using an address you control and confirm the matching `subscribers` row and consent timestamp in D1. The query is in the [concierge setup](CONCIERGE_SETUP.md).
4. To publish verified offers, set `CARAT_PUBLISH_VERIFIED_OFFERS=1` for the production Pages build. Deploy the Worker first so the build can read `/api/health` and `/api/catalog` on the canonical host. An offer requires approved exact-item details, one matching purchasable D1 variant per canonical page, and `availability: 'InStock'` in its approved storefront record. Set that availability only when orders are open and the supplier has confirmed it can fulfill on time. Rebuild Pages after changing price, availability, or eligibility. In Merchant Center, configure delivery for each approved target country and check that the availability and USD price agree across the store, hosted checkout, and feed. [Google Merchant availability requirements](https://support.google.com/merchants/answer/6324448)

## 6. Verify the site in Google Search Console

1. Sign in to Google Search Console with the account that will manage the property. Choose **Add property → Domain**, enter `carat.evercrest.vip` without a scheme or trailing slash, and copy the DNS verification record Google supplies. [Google Search Console](https://search.google.com/search-console/) · [DNS ownership verification](https://support.google.com/webmasters/answer/9008080)
2. In Cloudflare, open the authoritative `evercrest.vip` zone and choose **DNS → Records → Add record**. For TXT verification, set **Type** to `TXT`, **Name** to `carat` if the zone appends `evercrest.vip`, **Content** to Google's complete `google-site-verification=…` value, and **TTL** to **Auto**. If Google supplies a CNAME instead, use its exact verification name and target as a **DNS only** record. Leave the Pages routing record in place. If DNS rejects the same-name TXT record, verify the parent `evercrest.vip` Domain property with a TXT record at `@`, then add the child property from the same Google account. [Cloudflare DNS record management](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/) · [Google child-property verification](https://support.google.com/webmasters/answer/9008080)
3. Return to Search Console and click **Verify**. If DNS has yet to propagate, wait and retry. Leave the verification record published. Ownership is confirmed when Search Console shows verification success.
4. Select the storefront property and open **Sitemaps**. Submit `https://carat.evercrest.vip/sitemap.xml` and wait for **Success** in the report. When the form already displays the site prefix, enter `sitemap.xml`. [Google Sitemaps report](https://support.google.com/webmasters/answer/7451001)
5. Open **URL Inspection** and paste the full canonical homepage URL. Click **Test live URL**. Once the page is eligible, click **Request indexing**. Repeat for priority public URLs such as `/shop/`, `/shipping-delivery/`, and the public product pages listed in the sitemap. Check the later Page indexing report for the actual result. Search Console ownership and Google indexing were outside the automated verification. [Google URL Inspection](https://support.google.com/webmasters/answer/9012289)
