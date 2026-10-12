/**
 * Pure MCP protocol helpers for /mcp (no DB / Next imports so it is unit-testable).
 *
 * Discovery methods (initialize, notifications/initialized, tools/list, ping) are
 * public so MCP directories (Smithery, Glama, registries) can inspect the server.
 * Everything else — notably every tools/call — still requires a Bearer fv_live_ key.
 */

export const MCP_SERVER_INFO = { name: "6frame-verify", title: "6Frame Verify", version: "1.3.0" } as const;

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

/** Tools callable WITHOUT an API key (free, no tenant data). */
export const KEYLESS_TOOLS: ReadonlySet<string> = new Set(["verify_get_capabilities", "verify_signup", "verify_quote"]);

const URL_PROP = { type: "string", description: "Public https:// URL of the site to check" };

export const MCP_TOOLS = [
  {
    name: "verify_get_capabilities",
    description:
      "Free, no key. What 6Frame Verify checks, prices (Quick $3, Full $12, credit packs $9→$10 and $29→$35), free tier (1 Quick Check/day per key) and how to sign up.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_signup",
    description:
      "Free, no key. Create an API key from an email address (shown once). Includes 1 free Quick Check per day. Rate limited.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string", description: "Email of the human who owns this key" } },
      required: ["email"],
    },
  },
  {
    name: "verify_quote",
    description: "Free, no key. Price for checking a URL (website_quick = 1 page, website_full = up to 10 pages).",
    inputSchema: {
      type: "object",
      properties: { url: URL_PROP, sku: { type: "string", enum: ["website_quick", "website_full"] } },
      required: ["url"],
    },
  },
  {
    name: "verify_check_site",
    description:
      "Run a pre-launch QA check on a live site: real Chromium on desktop + mobile, HTTP status, broken links, title/meta/H1, Open Graph, mobile overflow, console errors, screenshots. Uses today's free Quick Check, else prepaid credit, else returns payment options: a Stripe checkout_url for a human ($3 Quick / $12 Full) and, when available, x402 USDC-on-Base details (accepts[]) so an agent can pay itself — retry with x402_payment. No API key is needed for the x402 path.",
    inputSchema: {
      type: "object",
      properties: {
        url: URL_PROP,
        sku: { type: "string", enum: ["website_quick", "website_full"], default: "website_quick" },
        paths: { type: "array", items: { type: "string" }, description: "website_full only: extra paths like /pricing" },
        brief: { type: "string", description: "Optional: what the site must do" },
        required_terms: { type: "array", items: { type: "string" } },
        required_ctas: { type: "array", items: { type: "string" } },
        pay_with: { type: "string", enum: ["auto", "free", "credit", "checkout", "x402"], default: "auto" },
        x402_payment: { type: "string", description: "Optional: base64 x402 X-PAYMENT payload (EIP-3009 USDC authorization) for the accepts[] requirement returned by a previous call. Pays for this check with no human." },
      },
      required: ["url"],
    },
  },
  {
    name: "verify_get_job",
    description: "Status of a check (queued, running, completed, completed_with_warnings, failed_platform). Requires API key.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "verify_get_report",
    description: "Signed report for a finished check: score, decision, findings with fixes, report page link. Requires API key.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "verify_get_credits",
    description: "Prepaid credit balance and today's free-check usage. Requires API key.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_buy_credits",
    description: "Get a Stripe checkout_url for a credit pack: credit_pack_9 ($9 → $10) or credit_pack_29 ($29 → $35). A human pays. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { pack: { type: "string", enum: ["credit_pack_9", "credit_pack_29"], default: "credit_pack_9" } },
    },
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
        "Pre-launch website QA in about 60 seconds. No key needed for verify_get_capabilities, verify_quote or verify_signup (creates a free key: 1 free Quick Check/day). Other tools need Authorization: Bearer fv_live_…. Paid checks: Quick $3, Full $12; credit packs $9 → $10, $29 → $35.",
    }),
  };
}

/** JSON-RPC tool result carrying an error the model can read and act on. */
export function toolError(body: McpRequestBody, text: string, data?: unknown): unknown {
  return rpcResult(body, {
    isError: true,
    content: [{ type: "text", text: data ? `${text}\n${JSON.stringify(data, null, 2)}` : text }],
  });
}

export function toolText(body: McpRequestBody, value: unknown): unknown {
  return rpcResult(body, {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  });
}
