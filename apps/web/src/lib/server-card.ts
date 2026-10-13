import { x402Config } from "@/lib/x402";
import { MCP_SERVER_INFO, MCP_TOOLS, DEFAULT_PROTOCOL_VERSION, KEYLESS_TOOLS } from "@/lib/mcp-protocol";

export function serverCard(base: string) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    serverInfo: MCP_SERVER_INFO,
    name: "io.github.bret1976/6frame-verify",
    description:
      "Pre-launch website QA in ~60s: real Chromium (desktop + mobile) checks links, SEO/OG tags, mobile overflow, console errors; scored report with screenshots and fix list.",
    websiteUrl: base,
    documentationUrl: `${base}/docs`,
    repository: "https://github.com/bret1976/6frame-verify",
    transport: { type: "streamable-http", endpoint: "/mcp" },
    remotes: [{ type: "streamable-http", url: `${base}/mcp` }],
    authentication: {
      required: false,
      schemes: ["bearer"],
      description: `Optional Authorization: Bearer fv_live_… key. Keyless tools: ${[...KEYLESS_TOOLS].join(", ")}. Free key via verify_signup or POST ${base}/v1/keys {} (no email needed).`,
    },
    capabilities: { tools: { listChanged: false } },
    payments: (() => {
      const x = x402Config();
      return {
        methods: ["free_daily_key", "prepaid_credit", "stripe_checkout", ...(x ? ["x402"] : [])],
        ...(x ? { x402: { version: 1, scheme: "exact", network: x.network, asset: x.asset, payTo: x.payTo, mcpArgument: "verify_check_site.x402_payment", restHeader: "X-PAYMENT" } } : {}),
      };
    })(),
    tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    links: {
      openapi: `${base}/.well-known/openapi.json`,
      agentCard: `${base}/.well-known/agent-card.json`,
      llms: `${base}/llms.txt`,
      registry: "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.bret1976/6frame-verify",
    },
  };
}
