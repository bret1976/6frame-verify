# 6Frame Verify — Stripe live setup (6Frame Studio acct_1TRFwqJVjV19Q08E)

MCP write for Products is currently denied. Bret must either:
1. Open the MCP reconsent URL and grant **write** (Products, Prices, Webhook Endpoints), then re-run creation; or
2. Create Products/Prices + webhook in Dashboard (below).

## A) Grant MCP write (preferred)
Open: https://access.stripe.com/mcp/oauth2/authorize/sessions/oases_VMuZiKreeScH1E  
Grant product/price/webhook write, then ask agent to create SKUs.

## B) Dashboard Products (Live mode)
Create these one-time Prices (USD):

| Product name | Amount | metadata.sku |
|---|---:|---|
| 6Frame Verify — Website Quick Check | $3.00 | website_quick |
| 6Frame Verify — Website Full Acceptance | $12.00 | website_full |
| 6Frame Verify — Creative Prompt/Continuity Pack | $6.00 | creative_pack |
| 6Frame Verify — Creative Sequence Acceptance | $25.00 | creative_sequence |
| 6Frame Verify — Prepaid Credit Pack | $100.00 | credit_pack (usable $110) |

## C) Webhook endpoint
- URL: `https://web-production-1cede.up.railway.app/v1/webhooks/stripe`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `charge.refunded`, `payment_intent.canceled`
- Copy Signing secret → Railway `STRIPE_WEBHOOK_SECRET` (`whsec_...`)

## D) Railway variables (web + worker)
From Dashboard → Developers → API keys (Live):
- `STRIPE_SECRET_KEY` = `sk_live_...`
- `STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
- `STRIPE_WEBHOOK_SECRET` = `whsec_...`
- Optional price IDs: `STRIPE_PRICE_WEBSITE_QUICK`, `STRIPE_PRICE_WEBSITE_FULL`, `STRIPE_PRICE_CREATIVE_PACK`, `STRIPE_PRICE_CREATIVE_SEQUENCE`, `STRIPE_PRICE_CREDIT_PACK`

Never commit keys. Never fake-unlock jobs.

## E) Smoke after secrets
1. `GET /v1/capabilities` → `payments.configured: true`, `mode: live`
2. Create quote → order (checkout) → pay → webhook → `order.status=paid`
3. `POST /v1/jobs` only then queues
