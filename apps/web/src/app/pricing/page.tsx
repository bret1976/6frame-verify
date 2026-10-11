import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Pricing — 6Frame Verify",
  description: "Website QA checks from $3. Credit packs $9 and $29. Free API key with 1 check per day.",
};

export default function PricingPage() {
  return (
    <div className="wrap">
      <Nav />
      <h1>Pricing</h1>
      <p className="lede">Pay per check, no subscription. Platform failures on our side are refunded or re-run.</p>
      <div className="grid">
        <div className="card">
          <h3>Quick Check</h3>
          <div className="price">$3</div>
          <p>One page · desktop + mobile · all checks · screenshots · shareable report.</p>
          <Link className="btn" href="/#check">
            Check my site — $3
          </Link>
        </div>
        <div className="card">
          <h3>Full Check</h3>
          <div className="price">$12</div>
          <p>Up to 10 pages (e.g. /, /pricing, /signup) in one report. Via API or MCP.</p>
          <Link className="btn" href="/docs">
            API docs
          </Link>
        </div>
        <div className="card">
          <h3>Starter credits</h3>
          <div className="price">$9</div>
          <p>$10 of checks (3 Quick Checks + change). Never expire.</p>
        </div>
        <div className="card">
          <h3>Pro credits</h3>
          <div className="price">$29</div>
          <p>$35 of checks (11 Quick or 2 Full + change). Never expire.</p>
        </div>
      </div>
      <h2>Free tier</h2>
      <div className="card">
        <p>
          Every <Link href="/get-key">free API key</Link> gets 1 Quick Check per day (UTC). Buy credit packs with your key:{" "}
          <span className="mono">POST /v1/credits/checkout {"{"}&quot;pack&quot;:&quot;credit_pack_9&quot;{"}"}</span> or the MCP tool{" "}
          <span className="mono">verify_buy_credits</span> — you get a Stripe checkout link.
        </p>
      </div>
      <Footer />
    </div>
  );
}
