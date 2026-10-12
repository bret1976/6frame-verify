import { env } from "@/lib/env";
import { MCP_TOOLS, KEYLESS_TOOLS } from "@/lib/mcp-protocol";
import { x402Config } from "@/lib/x402";
import { ensureStripeDeposit } from "@/lib/x402-stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureStripeDeposit().catch(() => {});
  const b = env().APP_BASE_URL;
  const tools = MCP_TOOLS.map((t) => `- ${t.name}${KEYLESS_TOOLS.has(t.name) ? " (no key)" : ""}: ${t.description}`).join("\n");
  const x = x402Config();
  const x402 = x
    ? `\n\n## Autonomous agent payment (x402, no human, no key)
- Every check can be paid per call in USDC on ${x.network} via x402 (HTTP 402). Payee ${x.payTo}. Quick $3, Full $12.
- REST: POST ${b}/v1/checks {"url":"https://..."} with no key returns 402 + \`accepts[]\` (also PAYMENT-REQUIRED header). Retry with header \`X-PAYMENT: <base64 payload>\`; returns 201 with job_id + report_page, X-PAYMENT-RESPONSE has the tx hash.
- MCP: call verify_check_site without a key; the error result lists accepts[]. Call again with argument x402_payment=<base64 payload>.
- Works with x402 clients (x402-fetch / x402-axios, Coinbase AgentKit / CDP wallets, x402 MCP wallet bridges).`
    : "";
  const body = `# 6Frame Verify

> Pre-launch website QA for AI agents. Loads a live https URL in real Chromium (desktop + mobile) and checks HTTP status, broken links, title/meta/H1, Open Graph, mobile overflow, console errors, load time, alt text and favicon. Returns a 0-100 score, ready-to-launch verdict, screenshots and an exact fix list. Call it after deploying, before saying "done".

## Connect (MCP, Streamable HTTP)
- Endpoint: ${b}/mcp
- Auth: optional header \`Authorization: Bearer fv_live_...\`. Get a free key with the verify_signup tool or POST ${b}/v1/keys {"email": "..."} (1 free Quick Check/day).
- Client config: {"mcpServers":{"6frame-verify":{"url":"${b}/mcp","headers":{"Authorization":"Bearer fv_live_..."}}}}
- Official MCP Registry name: io.github.bret1976/6frame-verify

## Tools
${tools}

## Pricing
- Free key: 1 Quick Check/day. Quick Check $3. Full Check (10 pages) $12. Credit packs $9 -> $10, $29 -> $35.
- Without credit, checks return a Stripe checkout_url (HTTP 402 on REST) for the human to pay.${x402}

## Machine-readable
- [MCP server card](${b}/.well-known/mcp/server-card.json)
- [OpenAPI 3.1](${b}/.well-known/openapi.json)
- [A2A agent card](${b}/.well-known/agent-card.json)
- [Capabilities](${b}/v1/capabilities)
- [Docs](${b}/docs)
- [Sample reports](${b}/samples)
- [Source](https://github.com/bret1976/6frame-verify)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
