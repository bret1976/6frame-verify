-- Self-serve keys, free tier, abuse limits, public order/report pages, samples.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS tenants_email_idx ON tenants(lower(email));
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS email TEXT;

-- Sliding-window rate limit events (subject is a salted hash, never a raw IP/email).
CREATE TABLE IF NOT EXISTS rate_events (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_lookup_idx ON rate_events(bucket, subject, created_at DESC);

-- Free tier: at most one free Quick Check per tenant per UTC day (PK enforces it).
CREATE TABLE IF NOT EXISTS free_checks (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  day DATE NOT NULL,
  order_id UUID REFERENCES orders(id),
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_idx ON orders(public_token) WHERE public_token IS NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_job BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
-- 'stripe' | 'credit' | 'free' (NULL = legacy rows)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_source TEXT;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS public_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_public_token_idx ON jobs(public_token) WHERE public_token IS NOT NULL;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT false;
