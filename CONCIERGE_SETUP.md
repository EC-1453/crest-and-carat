# Concierge and Private List setup

The standalone commerce Worker stores Private List, inquiry and buyer events in the D1 `subscribers` table. It keeps the original consent status and timestamp for each submission. The Milestone 1 `subscriber_events` table remains available as an archive.

## 1. Use D1 directly

1. Apply the Worker migrations and deploy it using the [README](README.md).
2. Submit a Private List signup and a contact inquiry using addresses you control.
3. In Cloudflare, open **Storage & databases → D1 SQL Database**, select the correct database and open its console. To see the latest requests, run:

   ```sql
   SELECT source, email, full_name, source_page, interest_category, marketing_opt_in,
          consent_timestamp, n8n_synced, created_at
   FROM subscribers
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. Use the recorded inquiry details for concierge follow-up if forwarding is unavailable. Keep access limited to staff who handle these communications. Before using a record for marketing, require explicit consent, apply your unsubscribe or suppression list and honor removal requests in D1 and any downstream systems.

## 2. Optionally forward events to n8n

1. If you already have a machine that can host a workflow, run n8n Community Edition there. Give its production webhook an HTTPS URL and use header authentication.
2. In the production Worker, set `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` using `npx wrangler secret put NAME --env production --config worker/wrangler.toml`. Configure n8n to expect `Authorization: Bearer YOUR_SECRET`. Store these values only as Worker secrets.
3. Deduplicate the workflow by `requestId` or the `Idempotency-Key` header. Respond successfully only after accepting the event. To build the Private List, filter on `marketingConsent === true`, keep `marketingConsentedAt` and apply the suppression list. Route inquiry messages to the concierge separately.
4. Confirm a successful request sets `n8n_synced = 1`. The Worker retries unsynced rows through Cron. Test deployments store D1 data locally and disable n8n calls.
