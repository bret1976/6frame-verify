import { Nav } from "@/components/Nav";

export default function DocsPage() {
  return (
    <div className="wrap">
      <Nav />
      <h1>Docs</h1>
      <p className="lede">
        Auth with <span className="mono">Authorization: Bearer fv_live_…</span>. Every write
        requires <span className="mono">Idempotency-Key</span>.
      </p>
      <div className="card">
        <h3>Flow</h3>
        <ol>
          <li>
            <span className="mono">GET /v1/capabilities</span>
          </li>
          <li>
            <span className="mono">POST /v1/quotes</span>
          </li>
          <li>
            <span className="mono">POST /v1/orders</span> → Stripe Checkout / PaymentIntent / credit
          </li>
          <li>Wait until order status is <span className="mono">paid</span> (webhook)</li>
          <li>
            <span className="mono">POST /v1/jobs</span> — unpaid jobs return 402
          </li>
          <li>
            Poll <span className="mono">GET /v1/jobs/{"{id}"}</span> then fetch report
          </li>
        </ol>
      </div>
      <p>
        Full OpenAPI: <a href="/.well-known/openapi.json">/.well-known/openapi.json</a>
      </p>
      <div className="footer">Changelog: v1.0.0 Website Acceptance · Creative continuity not offered</div>
    </div>
  );
}
