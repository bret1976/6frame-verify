# 6Frame Verify — pre-launch website QA in 60 seconds

Paste a URL; a real Chromium browser loads it on desktop and mobile and checks what breaks launches: HTTP status, broken links, title / meta description / H1, Open Graph social previews, mobile viewport + horizontal overflow, console errors, load time, image alt text, favicon. You get a shareable report with screenshots and exact fixes. Works for humans (web, $3) and AI agents (MCP / REST).

- **Check a site ($3, no account):** https://web-production-1cede.up.railway.app
- **Sample reports:** https://web-production-1cede.up.railway.app/samples
- **Free API key (1 free Quick Check/day):** https://web-production-1cede.up.railway.app/get-key
- **MCP (Streamable HTTP):** `https://web-production-1cede.up.railway.app/mcp`

## Pricing (live Stripe)

| What | Price |
|---|---|
| Free API key | 1 Quick Check per day |
| Quick Check — 1 page, desktop + mobile | $3 |
| Full Check — up to 10 pages | $12 |
| Starter credits | $9 → $10 usable |
| Pro credits | $29 → $35 usable |

## Use from an agent (MCP)

```json
{
  "mcpServers": {
    "6frame-verify": {
      "url": "https://web-production-1cede.up.railway.app/mcp",
      "headers": { "Authorization": "Bearer fv_live_..." }
    }
  }
}
```

No key yet? `verify_signup` (keyless) creates one from an email. Keyless tools: `verify_get_capabilities`, `verify_quote`, `verify_signup`. With a key: `verify_check_site` (free daily check → credit → Stripe checkout link for a human), `verify_get_job`, `verify_get_report`, `verify_get_credits`, `verify_buy_credits`.

## Use from a script (REST)

```bash
curl -X POST https://web-production-1cede.up.railway.app/v1/keys -H 'content-type: application/json' -d '{"email":"you@example.com"}'
curl -X POST https://web-production-1cede.up.railway.app/v1/checks -H "Authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"url":"https://your-site.com"}'
```

`/v1/checks` uses today's free Quick Check, else prepaid credit, else returns `402` with a Stripe `checkout_url`; the check runs automatically once paid. Full spec: `/.well-known/openapi.json`. Advanced quote → order → job flow is unchanged.

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
