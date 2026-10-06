import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { OFFERED_PROFILES, offeredSkuCatalog } from "@6frame/contracts";
import { stripeStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Minimal Streamable HTTP MCP surface.
 * Tools mirror REST; authorization requires Bearer fv_live_ key.
 */
export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) {
    return jsonError("unauthorized", "MCP requires Bearer fv_live_ API key", { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const method = body.method as string | undefined;

  if (method === "initialize" || method === "tools/list" || !method) {
    return jsonOk({
      protocol: "mcp",
      server: "6frame-verify",
      tools: [
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
      ],
    });
  }

  if (method === "tools/call") {
    const name = body.params?.name as string;
    if (name === "verify_get_capabilities") {
      if (!requireScope(auth, "verify:read") && !requireScope(auth, "verify:write")) {
        return jsonError("forbidden", "scope", { status: 403 });
      }
      return jsonOk({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                skus: offeredSkuCatalog(),
                profiles: OFFERED_PROFILES,
                payments: stripeStatus(),
                rest: "/v1",
              },
              null,
              2,
            ),
          },
        ],
      });
    }
    return jsonOk({
      content: [
        {
          type: "text",
          text: `Tool ${name} is available via REST adapter. Use /v1/* with Idempotency-Key for mutating calls.`,
        },
      ],
    });
  }

  return jsonError("unsupported_method", `Unsupported MCP method ${method}`, { status: 400 });
}

export async function GET() {
  return jsonOk({
    name: "6frame-verify",
    transport: "streamable-http",
    auth: "Bearer fv_live_",
    tools: [
      "verify_get_capabilities",
      "verify_quote",
      "verify_create_order",
      "verify_buy_credits",
      "verify_get_credits",
      "verify_submit_job",
      "verify_get_job",
      "verify_get_report",
    ],
  });
}
