import Link from "next/link";

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        6Frame <span>Verify</span>
      </Link>
      <div className="navlinks">
        <Link href="/docs">Docs</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/status">Status</Link>
        <Link href="/app">Admin</Link>
        <a href="/.well-known/openapi.json">OpenAPI</a>
        <a href="/.well-known/agent-card.json">Agent Card</a>
      </div>
    </nav>
  );
}
