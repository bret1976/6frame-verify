# 6Frame Verify

Paid agent-to-agent acceptance-testing API by **6Frame Studio** (Bret Jenny).

An AI agent pays 6Frame Verify to prove that its work actually meets the job before it says "done."

Live: https://web-production-1cede.up.railway.app · MCP: `https://web-production-1cede.up.railway.app/mcp` (Streamable HTTP, `Authorization: Bearer fv_live_…`)

## Pricing (live Stripe)

| SKU | What you get | Price |
|---|---|---|
| `website_quick` | Website Quick Check — 1 public HTTPS URL | $3 |
| `website_full` | Website Full Acceptance — up to 10 URLs | $12 |
| `credit_pack` | Prepaid credit pack — $110 usable on `website_quick` / `website_full` | $100 |

Profile: Website Acceptance `website-acceptance@1.0.0` (Playwright, deterministic evaluator, signed report + evidence).

## MCP tools

`verify_get_capabilities`, `verify_quote`, `verify_create_order`, `verify_buy_credits`, `verify_get_credits`, `verify_submit_job`, `verify_get_job`, `verify_get_report`

## Flow

1. `POST /v1/quotes` (or `verify_quote`) with a public HTTPS URL + brief → expiring quote
2. `POST /v1/orders` → Stripe Checkout URL (or `payment_mode: "credit"` to draw down prepaid credit)
3. Job queues only after the verified Stripe webhook / atomic credit reservation
4. `GET /v1/jobs/{id}/report` → signed acceptance report with evidence

## Monorepo

```
apps/web      Next.js public site + admin + REST/MCP/A2A API
apps/worker  Isolated Playwright Chromium verification worker
apps/cli     `6frame-verify` CLI skeleton
packages/contracts  Zod schemas + OpenAPI fragments
packages/evaluators Deterministic + stub semantic evaluators
packages/config     Shared env validation
db/migrations       PostgreSQL schema
```

## Quickstart (local)

```bash
cp .env.example .env
# fill DATABASE_URL, REDIS_URL, STRIPE_*, REPORT_SIGNING_PRIVATE_KEY, API_ENCRYPTION_KEY
pnpm install
pnpm db:migrate
pnpm --filter @6frame/web seed
pnpm dev:web
pnpm dev:worker
```

## Machine discovery

- `GET /.well-known/openapi.json`
- `GET /.well-known/agent-card.json`
- `GET /v1/capabilities`
- `POST /mcp` (Bearer API key)

## Hard rules

- Production never uses fake Stripe events, fake browser checks, mock results, or placeholder payment unlocks.
- Jobs queue **only** after Stripe webhook confirms payment or credit is atomically reserved.
- Stripe secrets live in Railway/Vercel env — never in source.

## License

Proprietary © 6Frame Studio
