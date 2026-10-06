import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { OFFERED_PROFILES, offeredSkuCatalog } from "@6frame/contracts";
import { stripeStatus } from "@/lib/stripe";
import { API_VERSION } from "@6frame/config";
import { requestId } from "@/lib/crypto";
import {
  MCP_TOOLS,
  handlePublicMcpMethod,
  rpcResult,
  type McpRequestBody,
} from "@/lib/mcp-protocol";

export const dynamic = "force-dynamic";

/**
 * Minimal Streamable HTTP MCP surface.
 * Discovery (initialize, notifications/initialized, tools/list, ping) is public so
 * MCP directories can inspect the server. Every tools/call (and any other method)
 * requires a Bearer fv_live_ key — unauthenticated callers get the same 401 as before.
 */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as McpRequestBody;

  const pub = handlePublicMcpMethod(body);
  if (pub) {
    if (pub.kind === "accepted") {
      return new Response(null, {
        status: 202,
        headers: { "X-Request-Id": requestId(), "X-API-Version": API_VERSION, "Cache-Control": "no-store" },
      });
    }
    return jsonOk(pub.body, { status: pub.status });
  }

  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) {
    return jsonError("unauthorized", "MCP requires Bearer fv_live_ API key", { status: 401 });
  }
  const method = body.method as string | undefined;

  if (!method) {
    return jsonOk({ protocol: "mcp", server: "6frame-verify", tools: MCP_TOOLS });
  }

  if (method === "tools/call") {
    const name = body.params?.name as string;
    if (name === "verify_get_capabilities") {
      if (!requireScope(auth, "verify:read") && !requireScope(auth, "verify:write")) {
        return jsonError("forbidden", "scope", { status: 403 });
      }
      return jsonOk(
        rpcResult(body, {
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
        }),
      );
    }
    return jsonOk(
      rpcResult(body, {
        content: [
          {
            type: "text",
            text: `Tool ${name} is available via REST adapter. Use /v1/* with Idempotency-Key for mutating calls.`,
          },
        ],
      }),
    );
  }

  return jsonError("unsupported_method", `Unsupported MCP method ${method}`, { status: 400 });
}

export async function GET() {
  return jsonOk({
    name: "6frame-verify",
    transport: "streamable-http",
    auth: "Bearer fv_live_ (required for tools/call; initialize, tools/list, ping are public)",
    tools: MCP_TOOLS.map((t) => t.name),
  });
}
