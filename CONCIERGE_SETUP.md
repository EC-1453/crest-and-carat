# Concierge and Private List setup

The contact form, Private List, and enabled checkout forms use the same Cloudflare Pages Function. That function records submissions in D1. The storefront uses an email link when the service is unavailable, and the contact form also offers a direct email copy when automated forwarding is unconfigured or fails. The visitor can review the copy in their email app before sending it.

## 1. Connect a free D1 database

1. Install the project dependencies with `npm ci` and sign in with `npx wrangler login`.
2. Create the database with `npx wrangler d1 create crest-and-carat-subscribers`. Copy the database UUID into the commented D1 section of `wrangler.toml` and uncomment that section. The binding name must be `SUBSCRIBERS_DB`.
3. Run `npx wrangler d1 migrations apply SUBSCRIBERS_DB --remote`. This creates the table and indexes. Run the same command with `--local` for local testing.
4. Deploy the Pages project with the D1 binding. If bindings are managed in the Cloudflare dashboard, open the Pages project, choose **Settings → Bindings**, and add the D1 database as `SUBSCRIBERS_DB` for Production. Give Preview a separate database if its forms should work, then redeploy after changing any bindings.
5. For local verification, run `npm run build` and `npm run pages:dev`. Use the printed Wrangler URL. `npm run dev` serves the React UI in isolation and uses the direct email fallback.

The database and Pages Function can run within Cloudflare’s free-plan quotas. Monitor usage in the account dashboard and keep production and preview data separate.

## 2. Optionally forward events with n8n

1. In a self-hosted n8n Community Edition instance, create a `POST` Webhook and protect it with header authentication. Use an HTTPS production webhook URL.
2. Configure Cloudflare Pages server secrets named `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`. Set the webhook’s authentication header to `Authorization` and value to `Bearer YOUR_SECRET`. The endpoint also works with an authenticated URL and an empty secret if the webhook host provides its own authentication. The webhook URL and secret stay on the server. A `VITE_` prefix exposes values in the frontend, so this integration uses `N8N_WEBHOOK_URL` as the server binding. For local testing with an authorized test webhook, put these values in the untracked `.dev.vars` file.
3. Use `requestId` or the `Idempotency-Key` header to deduplicate events in the workflow. Return a success status after the workflow has accepted the event. Forward genuine inquiries to `conciergeEmail`, which defaults to `privateclient@evercrest.vip` and can be overridden by the server variable `SUPPORT_EMAIL`. Use an already-configured mail connection for delivery.
4. For any mailing-list workflow, require `marketingConsent === true`, retain `marketingConsentedAt` with the record, and respect your unsubscribe list. An inquiry or checkout email by itself does not grant marketing consent. A `checkout` event describes checkout intent, so use the payment provider’s verified order webhook for payment confirmation and supplier fulfillment notifications.
5. Activate the workflow, redeploy Pages, and test with an address you control. If you leave n8n unconfigured, D1 continues accepting submissions. Review the `subscriber_events` table directly in the D1 console for saved inquiries and subscribers.

## 3. Manage inbox and consent records

Contact submissions can contain a name, selected piece, message, and email address. Checkout submissions contain an email address and piece slug. All submissions include a timestamp and a separate marketing consent timestamp when the visitor opts in. Payment data stays with the payment provider. Give D1 and forwarding access only to the people who need to handle these requests. Process unsubscribe and deletion requests according to the published privacy policy and your mailing workflow, including removal or suppression in copies forwarded to other services.

## 4. Turn on supplier notifications when checkout is verified

1. Connect a separate n8n workflow to the payment provider’s production order webhook. Verify the provider signature using its documented signing secret and raw request body, or accept the event from a provider-verified server integration. Confirm the order is paid and the currency, line items, amount, destination, and approved personalization match your server-side order record. The `/api/subscribers` checkout-intent event never starts fulfillment.
2. Look up each paid line item in a private fulfillment mapping that you maintain. Map the verified order item to its approved `supplier_id`, exact supplier SKU and variant, permitted destination, fulfillment instructions, and configured supplier contact. Validate the final personalization against the approved rules for that SKU. Keep vendor addresses and credentials in the automation environment.
3. Give each fulfillment request a durable unique key built from the provider order ID and line-item ID, and record the provider event ID. Claims and retries must use that same key. Send each supplier only the approved configuration and minimum delivery details for its own line items. Mark fulfillment requested only after your supplier’s configured channel accepts the request. Use your authorized business mailbox and configured `SUPPORT_EMAIL` for concierge exceptions.
4. Route missing mappings, payment mismatches, delivery restrictions, and failed sends to the concierge for review. Use the provider’s test environment and your own email address before enabling live notifications. The six launch pieces are inquiry-only and have no verified live vendor contacts, so the storefront does not currently send production supplier notifications.
