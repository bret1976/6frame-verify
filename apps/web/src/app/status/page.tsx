import { Nav } from "@/components/Nav";
import { stripeStatus } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  // Legacy Stripe success URLs (/status?order=<uuid>) → the order's own status page.
  const { order } = await searchParams;
  if (order && /^[0-9a-f-]{36}$/i.test(order)) {
    const { rows } = await query(`SELECT public_token FROM orders WHERE id=$1`, [order]).catch(() => ({ rows: [] as { public_token: string | null }[] }));
    if (rows[0]?.public_token) redirect(`/order/${rows[0].public_token}`);
  }
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
          <p>Real Chromium (Playwright) workers via Redis/BullMQ</p>
        </div>
      </div>
      <div className="footer">No open incidents.</div>
    </div>
  );
}
