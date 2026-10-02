import { Nav } from "@/components/Nav";
import { stripeStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default function StatusPage() {
  const stripe = stripeStatus();
  return (
    <div className="wrap">
      <Nav />
      <h1>Status</h1>
      <div className="grid">
        <div className="card">
          <h3>API</h3>
          <p>
            <span className="dot" /> Operational
          </p>
        </div>
        <div className="card">
          <h3>Stripe</h3>
          <p>
            <span className={stripe.configured ? "dot" : "dot warn"} />{" "}
            {stripe.configured ? `Configured (${stripe.mode})` : "Awaiting secrets"}
          </p>
        </div>
        <div className="card">
          <h3>Workers</h3>
          <p>Playwright queue via Redis/BullMQ</p>
        </div>
      </div>
      <div className="footer">No open incidents.</div>
    </div>
  );
}
