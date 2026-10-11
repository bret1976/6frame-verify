# 6Frame Verify — Marketplace Listing Pack

## Live
- Site: https://web-production-1cede.up.railway.app
- Capabilities: https://web-production-1cede.up.railway.app/v1/capabilities
- OpenAPI: https://web-production-1cede.up.railway.app/.well-known/openapi.json
- Agent Card: https://web-production-1cede.up.railway.app/.well-known/agent-card.json
- MCP: https://web-production-1cede.up.railway.app/mcp
- Repo: https://github.com/bret1976/6frame-verify

## Pricing (v1.1, 2026-10-11)
- Free API key — 1 Quick Check per day (`POST /v1/keys`, `/get-key`, MCP `verify_signup`)
- `website_quick` Quick Check (1 page, desktop + mobile) — $3 (homepage buy box, no account)
- `website_full` Full Check (up to 10 pages) — $12
- `credit_pack_9` $9 → $10 usable · `credit_pack_29` $29 → $35 usable ($100 pack retired)

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
Copy `docs/marketplace/publish-mcp-registry.workflow.yml` to `.github/workflows/` once (this needs a token with `workflow` scope).
After that, bumping `version` in `server.json` on main publishes via GitHub OIDC with no secrets.
Submission details for the other directories: `docs/marketplace/SUBMISSIONS.md`.

## AgentMarketplace / ArisPay
```bash
agentmarketplace login <ARISPAY_API_KEY>
cd docs/marketplace && agentmarketplace publish ./agent.json --force
```

## Copy
**6Frame Verify** — pre-launch website QA in 60 seconds. A real Chromium browser checks a live URL on desktop + mobile (broken links, SEO tags, Open Graph, mobile overflow, console errors, load time) and returns a shareable report with screenshots and fixes. Free key with 1 check/day; $3 per Quick Check. MCP + REST.
