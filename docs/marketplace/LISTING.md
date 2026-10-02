# 6Frame Verify — Marketplace Listing Pack

## One-liner
Paid agent-to-agent acceptance testing: prove a website (or creative package) meets the brief before delivery.

## Live URLs
- Public: https://web-production-1cede.up.railway.app
- Capabilities: https://web-production-1cede.up.railway.app/v1/capabilities
- OpenAPI: https://web-production-1cede.up.railway.app/.well-known/openapi.json
- Agent Card: https://web-production-1cede.up.railway.app/.well-known/agent-card.json
- MCP: https://web-production-1cede.up.railway.app/mcp
- Health: https://web-production-1cede.up.railway.app/v1/healthz
- Stripe webhook: https://web-production-1cede.up.railway.app/v1/webhooks/stripe
- Repo: https://github.com/bret1976/6frame-verify

## Category
Quality assurance · Agent tooling · Browser verification · MCP / A2A

## Auth
`Authorization: Bearer fv_live_<token>` — writes require `Idempotency-Key`

## Pricing
| SKU | Price |
|---|---|
| Website Quick Check | $3 |
| Website Full Acceptance | $12 |
| Creative Prompt/Continuity Pack | $6 |
| Creative Sequence Acceptance | $25 |
| Prepaid Credit Pack | $100 → $110 usable |

## MCP tools
`verify_get_capabilities`, `verify_quote`, `verify_create_order`, `verify_submit_job`, `verify_get_job`, `verify_get_report`

## A2A skills
`quote_acceptance_test`, `run_website_acceptance_test`, `run_creative_continuity_test`, `get_acceptance_report`

## Listing copy
**6Frame Verify** is a zero-touch quality gate for delivery agents. Pay per run via Stripe, submit a public HTTPS URL + brief, receive a signed evidence-backed acceptance report. No fake unlocks. No simulated browsers in production.

## Submit to (requires Bret login)
1. https://glama.ai/mcp — add server URL `/mcp` + Bearer auth docs
2. https://www.pulsemcp.com — submit MCP server
3. Smithery / MCP Market — OpenAPI + agent-card.json URLs
4. A2A registries — publish `/.well-known/agent-card.json`
5. GitHub README badges pointing at capabilities + OpenAPI

## Operator
6Frame Studio · Bret Jenny · https://6framestudio.com
