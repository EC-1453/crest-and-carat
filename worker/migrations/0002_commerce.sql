-- Set this version when publishing revised /terms/ content. Preserve a copy
-- of each published version for the order records that reference it.
CREATE TABLE commerce_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  terms_version TEXT NOT NULL CHECK (length(trim(terms_version)) BETWEEN 1 AND 80)
) STRICT;

CREATE TABLE catalog_items (
  sku TEXT PRIMARY KEY NOT NULL CHECK (length(trim(sku)) BETWEEN 1 AND 80),
  product_slug TEXT NOT NULL CHECK (length(trim(product_slug)) BETWEEN 1 AND 100),
  variant_id TEXT NOT NULL CHECK (length(trim(variant_id)) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  variant_name TEXT NOT NULL CHECK (length(trim(variant_name)) BETWEEN 1 AND 160),
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 1 AND 100000000),
  supplier_id TEXT NOT NULL CHECK (length(trim(supplier_id)) BETWEEN 1 AND 80 AND supplier_id <> 'manual'),
  supplier_sku TEXT NOT NULL CHECK (length(trim(supplier_sku)) BETWEEN 1 AND 120),
  supplier_cost_cents INTEGER NOT NULL CHECK (supplier_cost_cents > 0 AND supplier_cost_cents <= price_cents / 2),
  supplier_verified_at TEXT NOT NULL CHECK (julianday(supplier_verified_at) IS NOT NULL),
  supplier_verification_ref TEXT NOT NULL CHECK (length(trim(supplier_verification_ref)) BETWEEN 1 AND 500),
  supplier_api_approved INTEGER NOT NULL DEFAULT 0 CHECK (supplier_api_approved IN (0, 1)),
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity BETWEEN 1 AND 20),
  engraving_mode TEXT NOT NULL DEFAULT 'none' CHECK (engraving_mode IN ('none', 'optional', 'required')),
  engraving_min_length INTEGER NOT NULL DEFAULT 0 CHECK (engraving_min_length BETWEEN 0 AND 160),
  engraving_max_length INTEGER NOT NULL DEFAULT 0 CHECK (engraving_max_length BETWEEN engraving_min_length AND 160),
  engraving_allow_letters INTEGER NOT NULL DEFAULT 0 CHECK (engraving_allow_letters IN (0, 1)),
  engraving_allow_digits INTEGER NOT NULL DEFAULT 0 CHECK (engraving_allow_digits IN (0, 1)),
  engraving_extra_characters TEXT NOT NULL DEFAULT '' CHECK (length(engraving_extra_characters) <= 40),
  engraving_uppercase_only INTEGER NOT NULL DEFAULT 0 CHECK (engraving_uppercase_only IN (0, 1)),
  engraving_format TEXT NOT NULL DEFAULT 'text' CHECK (engraving_format IN ('text', 'decimal')),
  engraving_instructions TEXT NOT NULL DEFAULT '' CHECK (length(engraving_instructions) <= 1000),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  UNIQUE (product_slug, variant_id),
  CHECK (
    (engraving_mode = 'none' AND engraving_max_length = 0)
    OR (engraving_mode <> 'none' AND engraving_min_length > 0 AND length(trim(engraving_instructions)) > 0
      AND (engraving_format = 'decimal' OR engraving_allow_letters = 1 OR engraving_allow_digits = 1 OR length(engraving_extra_characters) > 0))
  )
) STRICT;

CREATE TABLE shipping_rates (
  country TEXT PRIMARY KEY NOT NULL CHECK (country GLOB '[A-Z][A-Z]'),
  region TEXT NOT NULL CHECK (region IN ('US', 'GULF', 'INTERNATIONAL')),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 160),
  rate_cents INTEGER NOT NULL CHECK (rate_cents BETWEEN 0 AND 10000000),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  CHECK (
    (country = 'US' AND region = 'US')
    OR (country IN ('AE', 'BH', 'KW', 'OM', 'QA', 'SA') AND region = 'GULF')
    OR (country NOT IN ('US', 'AE', 'BH', 'KW', 'OM', 'QA', 'SA') AND region = 'INTERNATIONAL')
  )
) STRICT;

CREATE TABLE catalog_item_destinations (
  sku TEXT NOT NULL REFERENCES catalog_items (sku) ON DELETE CASCADE,
  country TEXT NOT NULL REFERENCES shipping_rates (country) ON DELETE CASCADE,
  PRIMARY KEY (sku, country)
) STRICT;

CREATE TABLE tax_rules (
  country TEXT NOT NULL REFERENCES shipping_rates (country) ON DELETE CASCADE,
  administrative_area TEXT NOT NULL DEFAULT '' CHECK (length(administrative_area) <= 80 AND administrative_area = upper(trim(administrative_area))),
  postal_prefix TEXT NOT NULL DEFAULT '' CHECK (length(postal_prefix) <= 16 AND postal_prefix NOT GLOB '*[^0-9A-Z]*'),
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  taxable_shipping INTEGER NOT NULL DEFAULT 0 CHECK (taxable_shipping IN (0, 1)),
  disclosure TEXT NOT NULL CHECK (length(trim(disclosure)) BETWEEN 1 AND 2000),
  PRIMARY KEY (country, administrative_area, postal_prefix)
) STRICT;

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  order_reference TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  address_json TEXT NOT NULL CHECK (json_valid(address_json) AND json_type(address_json) = 'object'),
  processor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'payment_review', 'paid')),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
  tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents = subtotal_cents + shipping_cents + tax_cents),
  shipping_region TEXT NOT NULL CHECK (shipping_region IN ('US', 'GULF', 'INTERNATIONAL')),
  shipping_label TEXT NOT NULL,
  tax_disclosure TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  provider_payment_id TEXT,
  checkout_url TEXT,
  checkout_state TEXT NOT NULL DEFAULT 'new' CHECK (checkout_state IN ('new', 'creating', 'ready', 'uncertain')),
  checkout_claimed_at TEXT,
  received_cents INTEGER NOT NULL DEFAULT 0 CHECK (received_cents >= 0),
  last_payment_check_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  UNIQUE (processor, provider_payment_id),
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND received_cents = total_cents))
) STRICT;

CREATE INDEX orders_reconciliation_idx ON orders (last_payment_check_at, created_at) WHERE status <> 'paid';

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders (id),
  line_number INTEGER NOT NULL CHECK (line_number >= 0),
  sku TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  engraving TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_sku TEXT NOT NULL,
  supplier_api_approved INTEGER NOT NULL CHECK (supplier_api_approved IN (0, 1)),
  PRIMARY KEY (order_id, line_number)
) STRICT;

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY NOT NULL,
  processor TEXT NOT NULL,
  event_key TEXT NOT NULL,
  order_id TEXT REFERENCES orders (id),
  status TEXT NOT NULL,
  received_cents INTEGER CHECK (received_cents >= 0),
  provider_payment_id TEXT,
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  detail TEXT,
  UNIQUE (processor, event_key)
) STRICT;

CREATE INDEX payment_events_order_idx ON payment_events (order_id, created_at);
CREATE INDEX payment_events_webhook_idx ON payment_events (last_attempt_at, created_at)
WHERE status = 'webhook_received';

CREATE TABLE fulfillment_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders (id),
  supplier TEXT NOT NULL,
  merchant_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'submitting', 'reconciling', 'manual', 'submitted', 'shipped')),
  supplier_reference TEXT,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  lease_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_id, supplier),
  UNIQUE (id, order_id)
) STRICT;

CREATE INDEX fulfillment_jobs_due_idx ON fulfillment_jobs (next_attempt_at, created_at) WHERE status <> 'manual';

CREATE TABLE fulfillment_job_items (
  job_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  FOREIGN KEY (job_id, order_id) REFERENCES fulfillment_jobs (id, order_id),
  FOREIGN KEY (order_id, line_number) REFERENCES order_items (order_id, line_number),
  PRIMARY KEY (job_id, order_id, line_number),
  UNIQUE (order_id, line_number)
) STRICT;

CREATE TABLE fulfillment_events (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES fulfillment_jobs (id),
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX fulfillment_events_job_idx ON fulfillment_events (job_id, created_at);

CREATE TABLE shipments (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES fulfillment_jobs (id),
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  tracking_url TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (job_id, carrier, tracking_number)
) STRICT;

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders (id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'sent', 'manual')),
  first_attempt_at TEXT,
  next_attempt_at TEXT,
  lease_token TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider TEXT,
  provider_reference TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at, created_at) WHERE state IN ('pending', 'sending');

CREATE TABLE subscribers (
  request_id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('vip', 'inquiry', 'checkout', 'buyer', 'newsletter')),
  email TEXT NOT NULL,
  full_name TEXT,
  source_page TEXT,
  interest_category TEXT,
  message TEXT,
  marketing_opt_in INTEGER NOT NULL CHECK (marketing_opt_in IN (0, 1)),
  consent_timestamp TEXT,
  created_at TEXT NOT NULL,
  n8n_synced INTEGER NOT NULL DEFAULT 0 CHECK (n8n_synced IN (0, 1)),
  synced_at TEXT,
  sync_claim_until INTEGER,
  CHECK (marketing_opt_in = (consent_timestamp IS NOT NULL)),
  CHECK (source NOT IN ('vip', 'newsletter') OR marketing_opt_in = 1),
  CHECK (n8n_synced = (synced_at IS NOT NULL))
) STRICT;

CREATE INDEX subscribers_email_idx ON subscribers (email, created_at);
CREATE INDEX subscribers_unsynced_idx ON subscribers (created_at) WHERE n8n_synced = 0;
CREATE INDEX subscribers_marketing_idx ON subscribers (consent_timestamp) WHERE marketing_opt_in = 1;

INSERT INTO subscribers (
  request_id, source, email, full_name, source_page, interest_category, message,
  marketing_opt_in, consent_timestamp, created_at, n8n_synced, synced_at
)
SELECT request_id, source, email, name,
       CASE source WHEN 'inquiry' THEN '/contact/' WHEN 'checkout' THEN '/bag/' ELSE '/' END,
       product_slug, message, marketing_consented_at IS NOT NULL, marketing_consented_at, created_at, forwarded_at IS NOT NULL, forwarded_at
FROM subscriber_events;
