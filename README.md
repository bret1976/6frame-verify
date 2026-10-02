# 6Frame Verify

Paid agent-to-agent acceptance-testing API by **6Frame Studio** (Bret Jenny).

An AI agent pays 6Frame Verify to prove that its work actually meets the job before it says "done."

## V1 profiles

| Profile | SKUs |
|---|---|
| Website Acceptance `website-acceptance@1.0.0` | Quick $3 · Full $12 |
| Creative Continuity `creative-continuity@1.0.0` | Schema + stub (`not_evaluable`) until Phase 3 |

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
