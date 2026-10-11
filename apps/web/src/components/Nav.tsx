import Link from "next/link";

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        6Frame <span>Verify</span>
      </Link>
      <div className="navlinks">
        <Link href="/#check">Check my site</Link>
        <Link href="/samples">Sample reports</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/docs">API &amp; MCP</Link>
        <Link href="/get-key" className="navcta">
          Free API key
        </Link>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <div className="footer">
      <div className="footlinks">
        <Link href="/pricing">Pricing</Link>
        <Link href="/samples">Samples</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/status">Status</Link>
        <a href="/.well-known/openapi.json">OpenAPI</a>
        <a href="/.well-known/agent-card.json">Agent card</a>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/acceptable-use">Acceptable use</Link>
      </div>
      <p>© 6Frame Studio · Pre-launch website QA · Payments by Stripe</p>
    </div>
  );
}
