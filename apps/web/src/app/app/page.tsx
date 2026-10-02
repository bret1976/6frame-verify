import { Nav } from "@/components/Nav";
import { query } from "@/lib/db";
import { stripeStatus } from "@/lib/stripe";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const h = await headers();
  const token = h.get("x-admin-token") || "";
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || token !== expected) {
    return false;
  }
  return true;
}

export default async function AdminPage() {
  const ok = await requireAdmin();
  const stripe = stripeStatus();
  let stats = { orders: 0, jobs: 0, paid: 0, revenue: 0 };
  let recent: Array<Record<string, unknown>> = [];
  let dbOk = false;
  try {
    const o = await query<{ c: string; revenue: string }>(
      `SELECT COUNT(*)::text AS c, COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','consumed','credit_reserved')),0)::text AS revenue FROM orders`,
    );
    const j = await query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM jobs`);
    const p = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM orders WHERE status IN ('paid','consumed','credit_reserved')`,
    );
    stats = {
      orders: Number(o.rows[0]?.c ?? 0),
      jobs: Number(j.rows[0]?.c ?? 0),
      paid: Number(p.rows[0]?.c ?? 0),
      revenue: Number(o.rows[0]?.revenue ?? 0) / 100,
    };
    const r = await query(
      `SELECT j.id, j.status, j.created_at, o.amount, o.status AS order_status
       FROM jobs j JOIN orders o ON o.id = j.order_id
       ORDER BY j.created_at DESC LIMIT 20`,
    );
    recent = r.rows;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return (
    <div className="wrap">
      <Nav />
      <h1>Admin</h1>
      {!ok && (
        <div className="card">
          <h3>Auth required</h3>
          <p>
            Send header <span className="mono">x-admin-token</span> matching{" "}
            <span className="mono">ADMIN_TOKEN</span>. Overview below is redacted until
            authenticated clients call with the header (or use /app/runs after configuring a
            browser extension / curl).
          </p>
        </div>
      )}
      <div className="grid">
        <div className="card">
          <h3>Database</h3>
          <p>
            <span className={dbOk ? "dot" : "dot bad"} /> {dbOk ? "Connected" : "Unreachable"}
          </p>
        </div>
        <div className="card">
          <h3>Stripe</h3>
          <p>
            <span className={stripe.configured ? "dot" : "dot warn"} />{" "}
            {stripe.configured ? stripe.mode : "not configured"}
          </p>
        </div>
        <div className="card">
          <h3>Gross (tracked)</h3>
          <div className="price">${stats.revenue.toFixed(2)}</div>
          <p>
            {stats.paid} paid · {stats.jobs} jobs · {stats.orders} orders
          </p>
        </div>
      </div>
      {ok && (
        <>
          <h2>Recent runs</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={String(row.id)}>
                    <td className="mono">{String(row.id).slice(0, 8)}</td>
                    <td>{String(row.status)}</td>
                    <td>{String(row.order_status)}</td>
                    <td>${(Number(row.amount) / 100).toFixed(2)}</td>
                    <td>{String(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="footer">No silent deletes. Financial + audit records are immutable.</div>
    </div>
  );
}
