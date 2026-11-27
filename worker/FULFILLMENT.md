# Fulfillment and shipping email

The Worker creates one fulfillment job per approved supplier and a manual job for any remaining lines. Jobs enter the queue when a payment processor verifies the full order total. The Worker uses the purchase-order reference in `fulfillment_jobs.merchant_reference` for submission, lookups and operator follow-up.

## 1. Enable Stuller Pack & Ship

1. Open a Stuller trade account, request Pack & Ship access, and have Stuller confirm that the account can place orders through the Order API. Ask for the account number, Pack & Ship order type, approved account payment type, shipping methods, supported countries and any purchase-order field limits. Ask Stuller to confirm the required recipient address fields and the engraving parameters for each SKU you plan to automate.
2. Create a Stuller developer login. From the repository root, store the credentials in Cloudflare Workers Secrets.

   ```sh
   npx wrangler secret put STULLER_USERNAME --config worker/wrangler.toml --env production
   npx wrangler secret put STULLER_PASSWORD --config worker/wrangler.toml --env production
   npx wrangler secret put STULLER_ACCOUNT --config worker/wrangler.toml --env production
   ```

3. Add the verified settings under `[env.production.vars]` in `worker/wrangler.toml`. Keep all approval flags off until the account setup is verified.

   | Setting | Value |
   | --- | --- |
   | `STULLER_ENABLED` | `true` when ready to accept automated submissions |
   | `STULLER_PACK_AND_SHIP_APPROVED` | `true` after Stuller approves production API Pack & Ship |
   | `STULLER_ORDER_TYPE` and `STULLER_PAYMENT_TYPE` | Account-specific values confirmed by Stuller |
   | `STULLER_APPROVED_COUNTRIES` | Comma-separated two-letter country codes approved for Pack & Ship, for example `US` |
   | `STULLER_SHIP_METHOD_US` | Stuller-approved shipping method for US addresses |
   | `STULLER_SHIP_METHOD_INTERNATIONAL` | Stuller-approved shipping method for enabled international addresses |
   | `STULLER_ENGRAVING_OPTIONS_JSON` | Optional map keyed by the exact Stuller SKU. Each entry uses numeric `location` and `lineLocation`, string `type` and `font`, and optional strings `size`, `fillOption`, `fillColor` and `finish`. Use Stuller-approved values. |
   | `STULLER_DISPATCH_EMAIL` | Optional supplier mailbox approved for purchase-order confirmations |

4. In D1, set each approved catalog variant's `supplier_id` to `stuller`, `supplier_sku` to the confirmed Stuller item number, and `supplier_api_approved` to `1`. Keep its price, verified cost and shipping destinations current. The Worker checks both the order snapshot and the current catalog approval before submission. Engraved lines also require the corresponding entry in `STULLER_ENGRAVING_OPTIONS_JSON`.
5. Confirm the full payload and exact PO lookup with Stuller using its approved verification process before enabling automatic submission. Include a personalized line and every delivery market you intend to enable. The Worker sends a single automatic purchase request per job, requests signature on delivery and excludes pricing from the shipment. A network failure triggers lookup by exact purchase-order reference. Continued uncertainty goes to manual review. [Stuller Pack & Ship](https://www.stuller.com/services/e-commerce-business/pack-and-ship-program), [Order submission](https://api.stuller.com/Help/Api/POST-namespace-v2.Orders-SubmitOrder), [Order lookup](https://api.stuller.com/Help/Api/POST-namespace-v2.Orders-Rest), [Invoice tracking](https://api.stuller.com/Help/Api/POST-namespace-v2.Invoice-Rest)

## 2. Configure transactional email

1. Choose one transactional provider. Resend has a free tier and supports retrying the exact same message with an idempotency key. Check the provider's current limits. Keep link tracking disabled on the sending domain or stream so private order links are delivered as written. [Resend pricing](https://resend.com/pricing), [Resend domain settings](https://resend.com/docs/dashboard/domains/introduction), [Postmark pricing](https://postmarkapp.com/pricing), [MailChannels pricing](https://docs.mailchannels.com/email-api/billing/pricing)
2. Verify `evercrest.vip` using the provider's DNS records. Set up the `privateclient@evercrest.vip` mailbox and route `support@evercrest.vip` to the team handling replies. Use one of these settings and store its key as a Worker Secret.

   | `EMAIL_PROVIDER` | Worker Secret | Account setup |
   | --- | --- | --- |
   | `resend` | `RESEND_API_KEY` | Verify the sending domain and create a sending key |
   | `postmark` | `POSTMARK_SERVER_TOKEN` | Verify the sender or domain and use the transactional `outbound` stream |
   | `mailchannels` | `MAILCHANNELS_API_KEY` | Verify Domain Lockdown and SPF. MailChannels requires a payment method on file for unrestricted recipients. |

   ```sh
   npx wrangler secret put RESEND_API_KEY --config worker/wrangler.toml --env production
   ```

   [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Postmark sender setup](https://postmarkapp.com/developer/user-guide/send-email-with-api), [MailChannels setup](https://docs.mailchannels.com/email-api/curl/quickstart)
3. Keep `SENDER_EMAIL=privateclient@evercrest.vip` and `SUPPORT_EMAIL=support@evercrest.vip` in the production Worker configuration. Deploy after configuring the provider and secrets. Confirm a delivered test email using the provider's own test tools and inspect its sender and reply-to addresses.
4. Review pending or manual email rows in `email_outbox`. Manually verify the provider message history before resending an uncertain message. Automatic Resend retries use the original message and idempotency key within its 24-hour window. Ambiguous Postmark and MailChannels sends stay in the review queue.

## 3. Work the manual fulfillment queue

1. Open **Cloudflare → D1 → crest-and-carat-db → Console**. Run this query to list jobs and their purchase-order references.

   ```sql
   SELECT o.order_reference, j.merchant_reference, j.last_error, j.created_at
   FROM fulfillment_jobs j
   JOIN orders o ON o.id = j.order_id
   WHERE j.status = 'manual'
   ORDER BY j.created_at;
   ```

2. Match the lines through `fulfillment_job_items` and `order_items`. If the Worker tried to submit the purchase, look up its exact reference in Stuller and confirm with the supplier whether it exists before taking further action. Review the audit trail in `fulfillment_events`. The merchant summary email includes the affected variants and exact engraving.
3. When the manually arranged shipment is on its way, send the carrier's tracking number to `POST /api/admin/shipments` on the Worker with `Authorization: Bearer <SHIPMENT_ADMIN_SECRET>` and an `application/json` body. Replace the sample purchase-order reference with the exact D1 value. The optional URL must be an HTTPS link on UPS, FedEx, US Postal Service, DHL or Aramex. Submit an additional request for each parcel.

   ```json
   {
     "merchantReference": "CC-0123456789ABCDEF0123456789ABCDEF",
     "carrier": "UPS",
     "trackingNumber": "1Z0000000000000000",
     "trackingUrl": "https://www.ups.com/track?tracknum=1Z0000000000000000"
   }
   ```

4. Check the new `shipments` row and the buyer notification in `email_outbox`. The buyer's email carries a private Track Order link. Repeating an identical parcel update preserves the existing tracking record and email. Automated Stuller shipments arrive through the scheduled invoice lookup.

## 4. Keep test and production separate

Use separate Cloudflare D1 databases and Worker secrets as described in the repository setup guide. `ENVIRONMENT=test` routes orders to the local manual queue and suppresses all supplier and transactional email network calls. It can still validate job creation, shipment persistence, outbox content, and signed private tracking. Keep production integrations disabled until you verify the supplier account, each automated SKU and each destination.
