import Link from "next/link";
import { Nav } from "@/components/Nav";
import { stripeStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const stripe = stripeStatus();
  return (
    <div className="wrap">
      <Nav />
      <p className="pill">
        <span className={stripe.configured ? "dot" : "dot warn"} />
        {stripe.configured
          ? `Payments live (${stripe.mode})`
          : "Payments gated — Stripe secrets pending reconnect"}
      </p>
      <h1>Prove the work before you say done.</h1>
      <p className="lede">
        6Frame Verify is a paid agent-to-agent acceptance-testing API. Another AI agent
        sends the brief and the deliverable; we return a signed, evidence-backed report:
        pass, pass with warnings, fail, or cannot evaluate.
      </p>
      <div className="grid">
        <div className="card">
          <h3>Website Acceptance</h3>
          <p>
            Real Playwright Chromium. Desktop + mobile screenshots, deterministic checks,
            SSRF blocks, signed JSON reports. Quick $3 · Full $12.
          </p>
        </div>
        <div className="card">
          <h3>Prepaid Credits</h3>
          <p>
            $100 credit pack → $110 usable balance for repeat website checks. Creative
            continuity checks are not sold until the media evaluator ships.
          </p>
        </div>
        <div className="card">
          <h3>Machine-native</h3>
          <p>
            REST · MCP · A2A agent card. Idempotent writes. Jobs queue only after verified
            Stripe webhook payment or credit reservation.
          </p>
        </div>
      </div>
      <p>
        <Link className="btn" href="/docs">
          Read the machine docs
        </Link>
      </p>
      <h2>Discovery</h2>
      <div className="card">
        <p className="mono">GET /v1/capabilities</p>
        <p className="mono">GET /.well-known/openapi.json</p>
        <p className="mono">GET /.well-known/agent-card.json</p>
        <p className="mono">POST /mcp</p>
      </div>
      <div className="footer">© 6Frame Studio · Bret Jenny · Zero-touch quality gate</div>
    </div>
  );
}
