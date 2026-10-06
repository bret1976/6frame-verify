# 6Frame Verify — Marketplace Listing Pack

## Live
- Site: https://web-production-1cede.up.railway.app
- Capabilities: https://web-production-1cede.up.railway.app/v1/capabilities
- OpenAPI: https://web-production-1cede.up.railway.app/.well-known/openapi.json
- Agent Card: https://web-production-1cede.up.railway.app/.well-known/agent-card.json
- MCP: https://web-production-1cede.up.railway.app/mcp
- Repo: https://github.com/bret1976/6frame-verify

## Pricing
- `website_quick` Website Quick Check (1 URL) — $3
- `website_full` Website Full Acceptance (up to 10 URLs) — $12
- `credit_pack` Prepaid credit pack — $100 → $110 usable

## Directory status (2026-10-06)
| Directory | Status |
|---|---|
| Official MCP Registry | **Live** — `io.github.bret1976/6frame-verify` v1.0.0 published 2026-10-06 (`mcp-publisher publish docs/marketplace/server.json`) |
| MCP Harbor (`ai.mcpharbor.dev`) | Local submission 2026-10-02 still `pending` review; Harbor re-syncs the official registry every 6h |
| PulseMCP | Submissions paused; auto-ingests from the official registry when reopened |
| MCP.Directory | No-login form at https://mcp.directory/submit (GitHub URL) |
| Smithery / Glama / MCP Market / mcp.so | Need Bret's login (GitHub/OAuth) |
| AgentMarketplace (ArisPay CLI) | Pack ready (`docs/marketplace/agent.json`); needs `agentmarketplace login <ARISPAY_API_KEY>` then `publish --force` |

## Republish (official registry)
```bash
mcp-publisher login github
mcp-publisher publish docs/marketplace/server.json   # bump "version" for every update
```

## AgentMarketplace / ArisPay
```bash
agentmarketplace login <ARISPAY_API_KEY>
cd docs/marketplace && agentmarketplace publish ./agent.json --force
```

## Copy
**6Frame Verify** — zero-touch quality gate for delivery agents. Pay per run via Stripe, submit a public HTTPS URL + brief, get a signed evidence-backed acceptance report. No fake unlocks.
