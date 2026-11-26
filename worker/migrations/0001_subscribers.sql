CREATE TABLE IF NOT EXISTS subscriber_events (
  request_id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('vip', 'inquiry', 'checkout')),
  email TEXT NOT NULL,
  name TEXT,
  product_slug TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  marketing_consented_at TEXT,
  forwarded_at TEXT,
  forwarding_claim_until INTEGER,
  CHECK (source <> 'vip' OR marketing_consented_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS subscriber_events_email_idx ON subscriber_events (email, created_at);
CREATE INDEX IF NOT EXISTS subscriber_events_consent_idx ON subscriber_events (marketing_consented_at) WHERE marketing_consented_at IS NOT NULL;
