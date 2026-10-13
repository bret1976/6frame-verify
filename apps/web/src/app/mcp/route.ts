import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, unauthorized } from "@/lib/http";
import {
  OFFERED_PROFILES,
  offeredSkuCatalog,
  SKU_PRICES_CENTS,
  FREE_QUICK_CHECKS_PER_DAY,
  SOLD_CREDIT_PACKS,
  type SoldCreditPack,
} from "@6frame/contracts";
import { assertSafePublicHttpsUrl } from "@6frame/evaluators";
import { stripeStatus } from "@/lib/stripe";
import { API_VERSION } from "@6frame/config";
import { requestId } from "@/lib/crypto";
import {
  MCP_TOOLS,
  KEYLESS_TOOLS,
  handlePublicMcpMethod,
  isJsonRpc,
  rpcResult,
  rpcMethodNotFound,
  toolError,
  toolText,
  type McpRequestBody,
} from "@/lib/mcp-protocol";
import { selfServeSignup } from "@/lib/signup";
import { clientIp } from "@/lib/ratelimit";
import { runCheck, x402AnonymousAuth } from "@/lib/checks";
import { x402Config } from "@/lib/x402";
import { ensureStripeDeposit } from "@/lib/x402-stripe";
import { jobForTenant, reportForTenant } from "@/lib/jobview";
import { balanceOf } from "@/lib/credits";
import { query } from "@/lib/db";
import { createCreditCheckout } from "@/lib/credit-checkout";
import { baseUrl, signupUrl, SIGNUP_HINT } from "@/lib/links";

export const dynamic = "force-dynamic";

function capabilities() {
  return {
    product: "6Frame Verify — pre-launch website QA in ~60 seconds",
    checks: [
      "HTTPS reachability + HTTP status per page",
      "Broken links on the page",
      "Title, meta description, single H1",
      "Open Graph / social preview tags, viewport meta, favicon",
      "Images missing alt text",
      "Horizontal overflow on desktop + mobile",
      "JavaScript console errors",
      "Full-page desktop + mobile screenshots",
      "Optional: required terms / CTAs / forbidden terms you specify",
    ],
    skus: offeredSkuCatalog(),
    free_tier: { quick_checks_per_day_per_key: FREE_QUICK_CHECKS_PER_DAY },
    profiles: OFFERED_PROFILES,
    payments: {
      live: stripeStatus().mode === "live",
      configured: stripeStatus().configured,
      x402: x402Config()
        ? { enabled: true, network: x402Config()!.network, asset: "USDC", pay_to: x402Config()!.payTo, how: "Call verify_check_site without a key (or with no credit); it returns x402 accepts[]. Sign an EIP-3009 USDC authorization and call again with argument x402_payment=<base64 X-PAYMENT payload>. REST: POST /v1/checks with header X-PAYMENT." }
        : { enabled: false },
    },
    signup: { url: signupUrl(), api: "POST /v1/keys {email}", mcp_tool: "verify_signup" },
    rest: `${baseUrl()}/v1`,
  };
}

function rpcOut(body: McpRequestBody, payload: unknown) {
  return jsonOk(payload);
}

/** One structured line per MCP request so the funnel is measurable (no secrets, IP hashed). */
function logMcp(req: Request, body: McpRequestBody, outcome: string) {
  try {
    const ip = clientIp(req);
    let h = 0;
    for (const c of `${process.env.RATE_LIMIT_SALT ?? "6fv"}:${ip}`) h = (h * 31 + c.charCodeAt(0)) | 0;
    const tool = body?.method === "tools/call" ? String((body.params as { name?: unknown } | undefined)?.name ?? "") : undefined;
    const ci = body?.method === "initialize" ? (body.params as { clientInfo?: { name?: string; version?: string } } | undefined)?.clientInfo : undefined;
    console.info(
      "[mcp]",
      JSON.stringify({
        m: body?.method ?? null,
        tool,
        client: ci ? `${ci.name ?? "?"}/${ci.version ?? "?"}` : undefined,
        ua: (req.headers.get("user-agent") ?? "").slice(0, 120),
        ip: (h >>> 0).toString(36),
        key: req.headers.get("authorization") ? "yes" : "no",
        out: outcome,
      }),
    );
  } catch {
    /* logging must never break MCP */
  }
}

export async function POST(req: Request) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as McpRequestBody;
  const res = await handlePost(req, body);
  let outcome = String(res.status);
  if (body?.method === "tools/call" && res.status === 200) {
    const t = await res.clone().text().catch(() => "");
    outcome = t.includes("Payment required") ? "402-x402" : t.includes('"isError":true') ? "tool_error" : "ok";
  }
  logMcp(req, body, outcome);
  return res;
}

async function handlePost(req: Request, body: McpRequestBody): Promise<Response> {
  await ensureStripeDeposit().catch(() => {});

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

  const method = body.method as string | undefined;
  const name = (body.params?.name as string | undefined) ?? "";
  const args = ((body.params?.arguments as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;

  // Keyless tools
  if (method === "tools/call" && KEYLESS_TOOLS.has(name)) {
    if (name === "verify_get_capabilities") return rpcOut(body, toolText(body, capabilities()));
    if (name === "verify_signup") {
      const out = await selfServeSignup({ email: args.email }, clientIp(req), "mcp");
      if (!out.ok) return rpcOut(body, toolError(body, out.message, { code: out.code }));
      return rpcOut(body, toolText(body, out.body));
    }
    if (name === "verify_quote") {
      const url = String(args.url ?? "");
      const sku = args.sku === "website_full" ? "website_full" : "website_quick";
      const safe = await assertSafePublicHttpsUrl(url);
      if (!safe.ok) return rpcOut(body, toolError(body, `URL can't be checked: ${safe.message}`));
      return rpcOut(
        body,
        toolText(body, {
          url,
          sku,
          amount_cents: SKU_PRICES_CENTS[sku],
          currency: "usd",
          free_today_with_key: sku === "website_quick",
          next: "verify_check_site (needs a key — verify_signup is free)",
        }),
      );
    }
  }

  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth && method === "tools/call" && name === "verify_check_site" && x402Config()) {
    const out = await runCheck(await x402AnonymousAuth(), args, clientIp(req), {
      payment: typeof args.x402_payment === "string" ? args.x402_payment : null,
      resource: `${baseUrl()}/mcp#verify_check_site`,
      anonymous: true,
    });
    if (out.status === 402) return rpcOut(body, toolError(body, "Payment required — pay autonomously with x402 (USDC), or use an API key", out.body));
    if (out.status >= 400) return rpcOut(body, toolError(body, "Check not started", out.body));
    return rpcOut(body, toolText(body, out.body));
  }
  if (!auth) {
    if (isJsonRpc(body) && method === "tools/call") {
      return rpcOut(
        body,
        toolError(body, `This tool needs an API key. ${SIGNUP_HINT} Sign up: ${signupUrl()}`, {
          signup_url: signupUrl(),
          keyless_tools: Array.from(KEYLESS_TOOLS),
        }),
      );
    }
    // Never answer a JSON-RPC MCP request with HTTP 401: clients treat it as "OAuth required"
    // and abort the connection. Unknown methods get a normal JSON-RPC error instead.
    if (isJsonRpc(body)) return jsonOk(rpcMethodNotFound(body));
    return unauthorized("MCP tools/call requires Bearer fv_live_ API key");
  }

  if (!method) return jsonOk({ protocol: "mcp", server: "6frame-verify", tools: MCP_TOOLS });
  if (method !== "tools/call") {
    return jsonOk(
      isJsonRpc(body)
        ? { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: `Method not found: ${method}` } }
        : { error: { code: "unsupported_method", message: `Unsupported MCP method ${method}` } },
      { status: isJsonRpc(body) ? 200 : 400 },
    );
  }
  if (!requireScope(auth, "verify:read") && !requireScope(auth, "verify:write")) {
    return rpcOut(body, toolError(body, "API key lacks verify scope"));
  }

  switch (name) {
    case "verify_get_capabilities":
      return rpcOut(body, toolText(body, capabilities()));
    case "verify_check_site": {
      const out = await runCheck(auth, args, clientIp(req), {
        payment: typeof args.x402_payment === "string" ? args.x402_payment : null,
        resource: `${baseUrl()}/mcp#verify_check_site`,
      });
      if (out.status >= 400 && out.status !== 402) return rpcOut(body, toolError(body, "Check not started", out.body));
      return rpcOut(body, out.status === 402 ? toolError(body, x402Config() ? "Payment needed — pay now with x402 (USDC, no human) or give checkout_url to a human" : "Payment needed — give checkout_url to a human", out.body) : toolText(body, out.body));
    }
    case "verify_get_job": {
      const j = await jobForTenant(String(args.job_id ?? ""), auth.tenantId);
      return rpcOut(body, j ? toolText(body, j) : toolError(body, "Job not found"));
    }
    case "verify_get_report": {
      const { job, report } = await reportForTenant(String(args.job_id ?? ""), auth.tenantId);
      if (!job) return rpcOut(body, toolError(body, "Job not found"));
      if (!report) return rpcOut(body, toolError(body, `Report not ready (status: ${job.status})`, { report_page: job.report_page }));
      return rpcOut(body, toolText(body, { report_page: job.report_page, ...(report as object) }));
    }
    case "verify_get_credits": {
      const bal = await balanceOf(null, auth.tenantId);
      const { rows } = await query(
        `SELECT COUNT(*)::int AS c FROM free_checks WHERE tenant_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date`,
        [auth.tenantId],
      );
      return rpcOut(body, toolText(body, { balance_cents: bal, free_checks_used_today: rows[0]?.c ?? 0, free_checks_per_day: FREE_QUICK_CHECKS_PER_DAY }));
    }
    case "verify_buy_credits": {
      const pack = (SOLD_CREDIT_PACKS as readonly string[]).includes(String(args.pack)) ? (args.pack as SoldCreditPack) : "credit_pack_9";
      try {
        return rpcOut(body, toolText(body, await createCreditCheckout(auth, pack)));
      } catch (e) {
        return rpcOut(body, toolError(body, (e as Error).message));
      }
    }
    default:
      return rpcOut(
        body,
        toolText(body, `Tool ${name} is available via the REST API at ${baseUrl()}/v1 (see /docs). Prefer verify_check_site.`),
      );
  }
}

export async function GET(req: Request) {
  // Streamable HTTP clients open GET with Accept: text/event-stream for server push.
  // We have no server->client stream: spec answer is 405, not a JSON 200 (SDK errors on that).
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  }
  return jsonOk({
    name: "6frame-verify",
    transport: "streamable-http",
    auth: "Bearer fv_live_ for most tools/call; keyless: verify_get_capabilities, verify_quote, verify_signup",
    signup: signupUrl(),
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

void rpcResult;
