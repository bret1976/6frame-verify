# 6Frame Verify — Stripe live setup (acct_1TRFwqJVjV19Q08E)

## Products / Prices (LIVE — created)

| SKU | Price ID | Amount |
|---|---|---:|
| website_quick | `price_1UMAmFJVjV19Q08E8eiXT3ZD` | $3 |
| website_full | `price_1UMAmLJVjV19Q08E4Fn2FDgt` | $12 |
| creative_pack (creative_prompt) | `price_1UMAmLJVjV19Q08EuhXTTGkr` | $6 |
| creative_sequence | `price_1UMAmNJVjV19Q08ENmggLHa7` | $25 |
| credit_pack | `price_1UMAmOJVjV19Q08ES60Rvnhi` | $100 |

Webhook endpoint: `we_1UMAmbJVjV19Q08EMuLsk5H3`  
URL: `https://web-production-1cede.up.railway.app/v1/webhooks/stripe`

## Railway env (web service) — DONE for price IDs
- `STRIPE_PRICE_WEBSITE_QUICK` = price_1UMAmFJVjV19Q08E8eiXT3ZD
- `STRIPE_PRICE_WEBSITE_FULL` = price_1UMAmLJVjV19Q08E4Fn2FDgt
- `STRIPE_PRICE_CREATIVE_PACK` = price_1UMAmLJVjV19Q08EuhXTTGkr
- `STRIPE_PRICE_CREATIVE_SEQUENCE` = price_1UMAmNJVjV19Q08ENmggLHa7
- `STRIPE_PRICE_CREDIT_PACK` = price_1UMAmOJVjV19Q08ES60Rvnhi
- `STRIPE_WEBHOOK_SECRET` = (Bret setting from webhook signing secret)

## Still required for payments.configured=true
From Stripe Dashboard → Developers → API keys (Live mode):
1. Set `STRIPE_SECRET_KEY` = `sk_live_...` on Railway **web** (and worker if needed)
2. Set `STRIPE_PUBLISHABLE_KEY` = `pk_live_...` on Railway **web**
3. Confirm `STRIPE_WEBHOOK_SECRET` = `whsec_...` matches webhook `we_1UMAmbJVjV19Q08EMuLsk5H3`

Do **not** invent or paste keys into git. After set, redeploy web and verify:
`GET /v1/capabilities` → `payments.configured: true`, `mode: live`

## MCP write reconsent (optional)
If agent should manage Products again: https://access.stripe.com/mcp/oauth2/authorize/sessions/oases_VMuZiKreeScH1E
