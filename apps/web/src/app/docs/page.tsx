import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API & MCP docs — 6Frame Verify",
  description: "Run website QA checks from scripts and AI agents: REST POST /v1/checks or the MCP server at /mcp.",
};

export default function DocsPage() {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return (
    <div className="wrap">
      <Nav />
      <h1>API &amp; MCP</h1>
      <p className="lede">
        Auth: <span className="mono">Authorization: Bearer fv_live_…</span> — <Link href="/get-key">get a free key</Link> (1 free Quick Check/day).
      </p>
      <h2>1. Get a key</h2>
      <pre className="codeblock">{`curl -X POST ${base}/v1/keys -H "content-type: application/json" \\
  -d '{"email":"you@example.com"}'`}</pre>
      <h2>2. Run a check</h2>
      <pre className="codeblock">{`curl -X POST ${base}/v1/checks -H "Authorization: Bearer $KEY" \\
  -H "content-type: application/json" -d '{"url":"https://your-site.com"}'`}</pre>
      <p className="lede">
        Uses today&apos;s free Quick Check, else prepaid credit, else returns <span className="mono">402</span> with a Stripe{" "}
        <span className="mono">checkout_url</span> — the check runs automatically once a human pays. Options:{" "}
        <span className="mono">sku</span> (website_quick | website_full), <span className="mono">paths</span> (Full, up to 10),{" "}
        <span className="mono">required_terms</span>, <span className="mono">required_ctas</span>, <span className="mono">forbidden_terms</span>,{" "}
        <span className="mono">pay_with</span> (auto | free | credit | checkout), <span className="mono">callback</span>.
      </p>
      <h2>3. Get the result</h2>
      <pre className="codeblock">{`GET /v1/jobs/{job_id}          # status
GET /v1/jobs/{job_id}/report   # signed JSON report
# or open report_page from the response in a browser`}</pre>
      <h2>Credits</h2>
      <pre className="codeblock">{`GET  /v1/credits
POST /v1/credits/checkout  -H "Idempotency-Key: <uuid>"  -d '{"pack":"credit_pack_9"}'   # $9 → $10
                                                         -d '{"pack":"credit_pack_29"}'  # $29 → $35`}</pre>
      <h2>MCP</h2>
      <pre className="codeblock">{`{
  "mcpServers": {
    "6frame-verify": {
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer fv_live_..." }
    }
  }
}`}</pre>
      <p className="lede">
        Keyless tools: <span className="mono">verify_get_capabilities</span>, <span className="mono">verify_quote</span>,{" "}
        <span className="mono">verify_signup</span>. With a key: <span className="mono">verify_check_site</span>,{" "}
        <span className="mono">verify_get_job</span>, <span className="mono">verify_get_report</span>, <span className="mono">verify_get_credits</span>,{" "}
        <span className="mono">verify_buy_credits</span>.
      </p>
      <h2>Advanced flow</h2>
      <p className="lede">
        Quote → order → job is still available (<span className="mono">POST /v1/quotes</span>, <span className="mono">/v1/orders</span>,{" "}
        <span className="mono">/v1/jobs</span>, all with <span className="mono">Idempotency-Key</span>). Full spec:{" "}
        <a href="/.well-known/openapi.json">/.well-known/openapi.json</a>.
      </p>
      <Footer />
    </div>
  );
}
