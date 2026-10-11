import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";
import { BuyBox } from "@/components/BuyBox";
import { stripeStatus } from "@/lib/stripe";
import { listSamples, DECISION_LABEL, decisionClass } from "@/lib/samples";

export const dynamic = "force-dynamic";

function host(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export default async function HomePage() {
  const stripe = stripeStatus();
  const samples = await listSamples(3);
  return (
    <div className="wrap">
      <Nav />
      <div className="hero">
        <div>
          <p className="pill">
            <span className={stripe.configured ? "dot" : "dot warn"} />
            {stripe.configured ? "Live · real browser checks · reports in ~60s" : "Payments temporarily unavailable"}
          </p>
          <h1>Pre-launch website QA in 60 seconds.</h1>
          <p className="lede">
            Paste your URL. A real Chrome browser loads your site on desktop and mobile and checks what
            breaks launches: broken links, missing titles and social previews, mobile overflow, console
            errors, slow loads. You get a shareable report with screenshots and exact fixes.
          </p>
          <ul className="checks desktoponly">
            <li>HTTP status &amp; HTTPS</li>
            <li>Broken links</li>
            <li>Title, meta description, H1</li>
            <li>Social preview (Open Graph)</li>
            <li>Mobile viewport &amp; overflow</li>
            <li>Console errors &amp; load time</li>
            <li>Image alt text &amp; favicon</li>
            <li>Desktop + mobile screenshots</li>
          </ul>
        </div>
        <BuyBox priceLabel="$3" />
      </div>
      <ul className="checks mobileonly">
        <li>HTTP status &amp; HTTPS</li>
        <li>Broken links</li>
        <li>Title, meta description, H1</li>
        <li>Social preview (Open Graph)</li>
        <li>Mobile viewport &amp; overflow</li>
        <li>Console errors &amp; load time</li>
        <li>Image alt text &amp; favicon</li>
        <li>Desktop + mobile screenshots</li>
      </ul>

      <h2>Sample reports</h2>
      {samples.length ? (
        <div className="grid">
          {samples.map((s) => (
            <Link className="card samplecard" href={`/r/${s.token}`} key={s.token}>
              <h3>{host(s.url)}</h3>
              <p>
                <span className={`badge ${decisionClass(s.decision)}`}>{DECISION_LABEL[s.decision] ?? s.decision}</span>{" "}
                <span className="score">{s.score}/100</span>
              </p>
              <p>
                {s.pass} passed · {s.warning} warnings · {s.fail} failed
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="lede">Sample reports are being generated.</p>
      )}
      <p>
        <Link href="/samples">All sample reports →</Link>
      </p>

      <h2>Pricing</h2>
      <div className="grid">
        <div className="card">
          <h3>Quick Check</h3>
          <div className="price">$3</div>
          <p>One page, desktop + mobile, full report. Pay per check.</p>
        </div>
        <div className="card">
          <h3>Full Check</h3>
          <div className="price">$12</div>
          <p>Up to 10 pages of your site in one report (API / MCP).</p>
        </div>
        <div className="card">
          <h3>Credit packs</h3>
          <div className="price">$9 · $29</div>
          <p>$9 → $10 of checks, $29 → $35. For repeat use from scripts and agents.</p>
        </div>
        <div className="card">
          <h3>Free</h3>
          <div className="price">$0</div>
          <p>
            <Link href="/get-key">Free API key</Link> with 1 Quick Check per day.
          </p>
        </div>
      </div>

      <h2>Built for AI agents too</h2>
      <div className="card">
        <p>
          Coding agents can verify a deploy before saying “done”. Connect the MCP server at{" "}
          <span className="mono">/mcp</span> — <span className="mono">verify_signup</span> creates a key,{" "}
          <span className="mono">verify_check_site</span> runs a check and returns the report (or a Stripe link for a human to pay).
          REST: <span className="mono">POST /v1/checks {"{"}&quot;url&quot;:&quot;https://…&quot;{"}"}</span>.{" "}
          <Link href="/docs">Docs →</Link>
        </p>
      </div>
      <Footer />
    </div>
  );
}
