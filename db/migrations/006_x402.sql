-- Autonomous agent payments (x402, USDC). One row per settled payment; nonce/tx unique => no replay.
CREATE TABLE IF NOT EXISTS x402_payments (
  id BIGSERIAL PRIMARY KEY,
  network TEXT NOT NULL,
  payer TEXT,
  pay_to TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  tx_hash TEXT UNIQUE,
  sku TEXT NOT NULL,
  tenant_id UUID,
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'verified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
