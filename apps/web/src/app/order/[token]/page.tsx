import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav, Footer } from "@/components/Nav";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { reconcileOrderWithStripe } from "@/lib/fulfil";
import { SKU_LABELS, CREDIT_PACKS, isCreditPackSku, type PricingSku } from "@6frame/contracts";
import { TERMINAL } from "@/lib/jobview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order status — 6Frame Verify", robots: { index: false, follow: false } };

async function load(token: string) {
  const { rows } = await query(`SELECT * FROM orders WHERE public_token=$1`, [token]);
  return rows[0] ?? null;
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  let order = await load(token);
  if (!order) notFound();
  // Server-side Stripe lookup (never trusts the redirect itself) so a lagging webhook can't strand the buyer.
  const stripe = getStripe();
  if (stripe && order.status === "payment_pending") {
    await reconcileOrderWithStripe(stripe, order as { id: string; status: string; stripe_checkout_session_id: string | null; sku: string });
    order = await load(token);
  }
  const { rows: jobs } = await query(
    `SELECT id, status, public_token FROM jobs WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [order.id],
  );
  const job = jobs[0];
  const { rows: q } = order.quote_id ? await query(`SELECT input_json FROM quotes WHERE id=$1`, [order.quote_id]) : { rows: [] };
  const url: string | undefined = q[0]?.input_json?.target_url;
  const credit = isCreditPackSku(order.sku);
  const jobDone = job && TERMINAL.includes(job.status);
  const waiting = order.status === "payment_pending" || (job && !jobDone) || (!credit && order.status === "paid" && order.auto_job && !job);

  let headline = "";
  let detail = "";
  if (order.status === "payment_pending") {
    headline = "Waiting for payment confirmation…";
    detail = "If you just paid, Stripe is confirming — this page refreshes automatically.";
  } else if (order.status === "expired") {
    headline = "Checkout expired";
    detail = "No payment was taken.";
  } else if (order.status === "refunded") {
    headline = "Refunded";
    detail = "This order was refunded.";
  } else if (credit) {
    headline = order.status === "credited" ? "Payment received — credits added" : "Payment received";
    detail = `${SKU_LABELS[order.sku as PricingSku]}: $${(CREDIT_PACKS[order.sku as keyof typeof CREDIT_PACKS].usable_cents / 100).toFixed(2)} of checks added to your API key's balance.`;
  } else if (job && !jobDone) {
    headline = "Payment received — checking your site now";
    detail = "A real browser is loading your site on desktop and mobile. Usually under a minute.";
  } else if (job && jobDone) {
    headline = "Your report is ready";
    detail = "";
  } else {
    headline = "Payment received";
    detail = order.auto_job ? "Starting your check…" : "Submit your job via the API (POST /v1/jobs) with this order id.";
  }

  return (
    <div className="wrap">
      {waiting && <meta httpEquiv="refresh" content="4" />}
      <Nav />
      <p className="pill">
        <span className={waiting ? "dot warn" : order.status === "expired" ? "dot bad" : "dot"} /> Order {String(order.id).slice(0, 8)}
      </p>
      <h1>{headline}</h1>
      {detail && <p className="lede">{detail}</p>}
      <div className="grid">
        <div className="card">
          <h3>Item</h3>
          <p>{SKU_LABELS[order.sku as PricingSku] ?? order.sku}</p>
          {url && <p className="mono">{url}</p>}
        </div>
        <div className="card">
          <h3>Amount</h3>
          <div className="price">${(Number(order.amount) / 100).toFixed(2)}</div>
        </div>
        <div className="card">
          <h3>Status</h3>
          <p data-testid="order-status">
            {order.status}
            {job ? ` · check ${job.status}` : ""}
          </p>
        </div>
      </div>
      {job?.public_token && (
        <p>
          {/* Plain <a>: a full document navigation. A client-side <Link> transition could be
              swallowed by this page's pending meta-refresh reload (first click "did nothing"). */}
          <a className="btn" href={`/r/${job.public_token}`} data-testid="view-report">
            {jobDone ? "View report" : "Open live report page"}
          </a>
        </p>
      )}
      <p className="fine">Bookmark this page — it is your private link to this order.</p>
      <Footer />
    </div>
  );
}
