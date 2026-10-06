-- Credit ledger hardening (credit_pack purchase + drawdown)
CREATE INDEX IF NOT EXISTS credit_ledgers_tenant_idx ON credit_ledgers(tenant_id, created_at DESC);
-- At most one purchase grant and one refund clawback per order (webhook replays cannot double-credit)
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledgers_one_grant_per_order
  ON credit_ledgers(order_id) WHERE reason = 'credit_pack_purchase';
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledgers_one_clawback_per_order
  ON credit_ledgers(order_id) WHERE reason = 'credit_pack_refund';
CREATE INDEX IF NOT EXISTS orders_tenant_sku_idx ON orders(tenant_id, sku);
