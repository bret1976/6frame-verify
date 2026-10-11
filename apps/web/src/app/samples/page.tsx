import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";
import { listSamples, DECISION_LABEL, decisionClass } from "@/lib/samples";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sample website QA reports — 6Frame Verify",
  description: "Real 6Frame Verify reports: broken links, SEO tags, mobile overflow, console errors and screenshots.",
};

export default async function SamplesPage() {
  const samples = await listSamples(12);
  return (
    <div className="wrap">
      <Nav />
      <h1>Sample reports</h1>
      <p className="lede">Real checks run by the same pipeline you buy. Click one to see the full report.</p>
      <div className="grid">
        {samples.map((s) => (
          <Link className="card samplecard" href={`/r/${s.token}`} key={s.token}>
            <h3>{s.url.replace(/^https:\/\//, "")}</h3>
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
      {!samples.length && <p className="lede">Samples are being generated.</p>}
      <p>
        <Link className="btn" href="/#check">
          Check my site — $3
        </Link>
      </p>
      <Footer />
    </div>
  );
}
