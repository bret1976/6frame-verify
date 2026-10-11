import type { Metadata } from "next";
import { Nav, Footer } from "@/components/Nav";
import { KeyForm } from "@/components/KeyForm";

export const metadata: Metadata = {
  title: "Free API key — 6Frame Verify",
  description: "Get a free 6Frame Verify API key with 1 free website QA check per day. REST and MCP.",
};

export default function GetKeyPage() {
  return (
    <div className="wrap">
      <Nav />
      <div className="hero">
        <div>
          <h1>Free API key</h1>
          <p className="lede">
            For developers and AI agents. Your key includes 1 free Quick Check per day. After that,
            checks use prepaid credit ($9 → $10, $29 → $35) or return a Stripe checkout link ($3 Quick, $12 Full).
          </p>
          <p className="lede">
            Agents can also sign up themselves with the keyless MCP tool <span className="mono">verify_signup</span>{" "}
            or <span className="mono">POST /v1/keys</span>.
          </p>
        </div>
        <KeyForm />
      </div>
      <Footer />
    </div>
  );
}
