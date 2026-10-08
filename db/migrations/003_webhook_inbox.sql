-- webhook-inbox-v1: track delivery attempts so a Stripe retry of a FAILED (or
-- crashed mid-flight) event is processed again instead of being acked as a
-- duplicate. Additive only; existing rows get attempt_count=1.
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 1;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT;
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events(provider, processing_status);
