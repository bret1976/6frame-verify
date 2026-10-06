/**
 * Pure MCP protocol helpers for /mcp (no DB / Next imports so it is unit-testable).
 *
 * Discovery methods (initialize, notifications/initialized, tools/list, ping) are
 * public so MCP directories (Smithery, Glama, registries) can inspect the server.
 * Everything else — notably every tools/call — still requires a Bearer fv_live_ key.
 */

export const MCP_SERVER_INFO = { name: "6frame-verify", title: "6Frame Verify", version: "1.0.0" } as const;

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

/** Methods answerable without an API key. They expose no tenant data and cost nothing. */
export const PUBLIC_MCP_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
  "ping",
]);

export function isPublicMcpMethod(method: unknown): boolean {
  return typeof method === "string" && PUBLIC_MCP_METHODS.has(method);
}

export const MCP_TOOLS = [
  {
    name: "verify_get_capabilities",
    description: "Profiles, price/rate limits (website_quick $3, website_full $12, credit_pack $100)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_quote",
    description: "Create website-acceptance quote — use REST POST /v1/quotes with same payload",
    inputSchema: { type: "object", properties: { profile: {}, input: {} } },
  },
  {
    name: "verify_create_order",
    description: "Create order from quote_id (payment_mode: checkout | payment_intent | credit)",
    inputSchema: {
      type: "object",
      properties: { quote_id: { type: "string" }, payment_mode: { type: "string" } },
    },
  },
  {
    name: "verify_buy_credits",
    description:
      "Buy a $100 prepaid credit pack ($110 usable) — REST POST /v1/credits/checkout with Idempotency-Key; returns Stripe Checkout URL",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_get_credits",
    description: "Prepaid credit balance and ledger — REST GET /v1/credits",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_submit_job",
    description: "Submit job for paid order",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string" }, profile: {}, input: {} },
    },
  },
  {
    name: "verify_get_job",
    description: "Get job status",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } } },
  },
  {
    name: "verify_get_report",
    description: "Get terminal report",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } } },
  },
];

export type McpRequestBody = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: Record<string, unknown> | undefined;
};

export type McpPublicResult =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "accepted"; status: 202 };

export function isJsonRpc(body: McpRequestBody): boolean {
  return body?.jsonrpc === "2.0";
}

/** Wrap a result in a JSON-RPC envelope when the client spoke JSON-RPC; else legacy shape. */
export function rpcResult(body: McpRequestBody, result: unknown): unknown {
  return isJsonRpc(body) ? { jsonrpc: "2.0", id: body.id ?? null, result } : result;
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;
}

function legacyToolList() {
  return { protocol: "mcp", server: MCP_SERVER_INFO.name, tools: MCP_TOOLS };
}

/**
 * Answer a public discovery method. Returns null if the method is not public
 * (caller must then authenticate).
 */
export function handlePublicMcpMethod(body: McpRequestBody): McpPublicResult | null {
  const method = body?.method;
  if (!isPublicMcpMethod(method)) return null;

  if (method === "notifications/initialized") {
    return { kind: "accepted", status: 202 };
  }
  if (method === "ping") {
    return { kind: "json", status: 200, body: rpcResult(body, {}) };
  }
  if (method === "tools/list") {
    return {
      kind: "json",
      status: 200,
      body: isJsonRpc(body) ? rpcResult(body, { tools: MCP_TOOLS }) : legacyToolList(),
    };
  }
  // initialize
  if (!isJsonRpc(body)) return { kind: "json", status: 200, body: legacyToolList() };
  return {
    kind: "json",
    status: 200,
    body: rpcResult(body, {
      protocolVersion: negotiateProtocolVersion(body.params?.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: MCP_SERVER_INFO,
      instructions:
        "Paid website acceptance testing. Discovery is public; every tools/call requires Authorization: Bearer fv_live_… (pricing: website_quick $3, website_full $12, credit_pack $100 → $110 usable).",
    }),
  };
}
