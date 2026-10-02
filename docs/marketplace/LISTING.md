# 6Frame Verify — Marketplace Listing Pack

## Live
- Site: https://web-production-1cede.up.railway.app
- Capabilities: https://web-production-1cede.up.railway.app/v1/capabilities
- OpenAPI: https://web-production-1cede.up.railway.app/.well-known/openapi.json
- Agent Card: https://web-production-1cede.up.railway.app/.well-known/agent-card.json
- MCP: https://web-production-1cede.up.railway.app/mcp
- Repo: https://github.com/bret1976/6frame-verify

## Submitted
| Directory | Status |
|---|---|
| MCP Harbor (`ai.mcpharbor.dev`) | **Submitted 202 Accepted** — `io.github.bret1976/6frame-verify` pending review |
| Official MCP Registry | Pack ready (`docs/marketplace/server.json`); needs `mcp-publisher login github` as bret1976 |
| AgentMarketplace (ArisPay CLI) | Pack ready (`docs/marketplace/agent.json`); needs `agentmarketplace login <api-key>` then `publish --force` |
| MCP.Directory | Form at https://mcp.directory/submit — paste GitHub `bret1976/6frame-verify` (Bret login) |
| agentmarketplace.ai creator hub | Account + review required (Bret) |

## Bret finish commands
```bash
# Official MCP Registry
npx -y @modelcontextprotocol/publisher init   # or mcp-publisher
mcp-publisher login github
mcp-publisher publish   # from docs/marketplace/server.json

# AgentMarketplace / ArisPay
agentmarketplace merchant signup --email=lvbretteam@gmail.com
agentmarketplace login <ARISPAY_API_KEY>
cd docs/marketplace && agentmarketplace publish ./agent.json --force
```

## Copy
**6Frame Verify** — zero-touch quality gate for delivery agents. Pay per run via Stripe, submit a public HTTPS URL + brief, get a signed evidence-backed acceptance report. No fake unlocks.
