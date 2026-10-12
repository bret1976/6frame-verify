import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, Footer } from "@/components/Nav";
import { query } from "@/lib/db";
import { DECISION_LABEL, decisionClass, effectiveDecision } from "@/lib/samples";
import { TERMINAL } from "@/lib/jobview";

export const dynamic = "force-dynamic";

const CHECK_NAMES: Record<string, string> = {
  "avail-https": "Site loads over HTTPS",
  "seo-title": "Page title",
  "seo-meta-desc": "Meta description",
  "seo-h1": "Single H1 heading",
  "viewport-overflow": "No sideways scrolling",
  "links-ok": "Broken links",
  "mobile-viewport-meta": "Mobile viewport tag",
  "social-og-tags": "Social preview (Open Graph)",
  "img-alt": "Image alt text",
  favicon: "Favicon",
  "console-errors": "Console errors",
  "load-time": "Load time",
};

function checkName(key: string, reqText?: string) {
  if (CHECK_NAMES[key]) return CHECK_NAMES[key];
  if (key.startsWith("path-")) return (reqText ?? "Page responds").replace(/^Required path (\S+) must return HTTP 2xx$/, "Page $1 responds");
  return reqText ?? key;
}

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { rows } = await query(
    `SELECT j.id, j.status, j.error_code, j.error_message, j.input_manifest, j.created_at, j.finished_at,
            r.artifact_json, r.score, r.release_decision, r.generated_at, r.is_sample, r.report_hash, r.signature
     FROM jobs j LEFT JOIN reports r ON r.job_id = j.id
     WHERE j.public_token=$1 ORDER BY r.report_version DESC NULLS LAST LIMIT 1`,
    [token],
  );
  const row = rows[0] ?? null;
  if (row?.release_decision) row.release_decision = effectiveDecision(row.release_decision, row.artifact_json?.summary?.fail);
  return row;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const row = await load(token).catch(() => null);
  const url = row?.input_manifest?.input?.target_url ?? "website";
  return {
    title: `QA report: ${url} — 6Frame Verify`,
    description: row?.release_decision
      ? `${DECISION_LABEL[row.release_decision] ?? row.release_decision} · score ${row.score}/100`
      : "Website QA report",
    robots: row?.is_sample ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await load(token);
  if (!row) notFound();
  const url: string = row.input_manifest?.input?.target_url ?? "";
  const terminal = TERMINAL.includes(row.status);

  if (!row.artifact_json) {
    return (
      <div className="wrap">
        {!terminal && <meta httpEquiv="refresh" content="5" />}
        <Nav />
        <p className="pill">
          <span className={terminal ? "dot bad" : "dot warn"} /> {terminal ? "Check failed" : "Checking…"}
        </p>
        <h1>{terminal ? "This check could not finish" : "Checking your site…"}</h1>
        <p className="lede">
          {url}
          <br />
          {terminal
            ? `Error: ${row.error_code ?? row.status}. ${row.error_message ? String(row.error_message).slice(0, 200) : ""} Platform failures are refunded or re-run.`
            : "A real browser is loading your site on desktop and mobile. This page refreshes automatically — usually under a minute."}
        </p>
        <Footer />
      </div>
    );
  }

  const report = row.artifact_json as {
    findings: Array<{ requirement_id: string; verdict: string; severity: string; reason: string; repair?: string }>;
    summary: { pass: number; warning: number; fail: number; not_evaluable: number };
    profile_version: string;
    integrity: { input_hash: string; report_hash: string; signature: string };
  };
  const { rows: reqs } = await query(`SELECT external_key, text FROM requirements WHERE job_id=$1`, [row.id]);
  const reqText = Object.fromEntries(reqs.map((r) => [r.external_key, r.text]));
  const { rows: shots } = await query(
    `SELECT name, byte_size FROM evidence_blobs WHERE job_id=$1 AND content_type LIKE 'image/%' ORDER BY name`,
    [row.id],
  );
  const order = { fail: 0, warning: 1, not_evaluable: 2, pass: 3, skipped: 4 } as Record<string, number>;
  const findings = [...report.findings].sort((a, b) => (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9));
  const fixes = findings.filter((f) => f.repair && (f.verdict === "fail" || f.verdict === "warning"));

  return (
    <div className="wrap">
      <Nav />
      <p className="pill">
        <span className={`dot ${decisionClass(row.release_decision) === "ok" ? "" : decisionClass(row.release_decision)}`} />
        Website QA report{row.is_sample ? " · sample" : ""}
      </p>
      <h1 className="reporttitle">{url.replace(/^https:\/\//, "")}</h1>
      <div className="grid">
        <div className="card">
          <h3>Verdict</h3>
          <p>
            <span className={`badge ${decisionClass(row.release_decision)}`}>{DECISION_LABEL[row.release_decision] ?? row.release_decision}</span>
          </p>
        </div>
        <div className="card">
          <h3>Score</h3>
          <div className="price">{row.score}/100</div>
        </div>
        <div className="card">
          <h3>Checks</h3>
          <p>
            {report.summary.pass} passed · {report.summary.warning} warnings · {report.summary.fail} failed
            {report.summary.not_evaluable ? ` · ${report.summary.not_evaluable} n/a` : ""}
          </p>
        </div>
      </div>

      {fixes.length > 0 && (
        <>
          <h2>Fix before launch</h2>
          <div className="card">
            <ol className="fixes">
              {fixes.map((f) => (
                <li key={f.requirement_id}>
                  <strong>{checkName(f.requirement_id, reqText[f.requirement_id])}:</strong> {f.repair}
                  <br />
                  <span className="muted">{f.reason}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      <h2>All checks</h2>
      <div className="card tablewrap">
        <table>
          <thead>
            <tr>
              <th>Result</th>
              <th>Check</th>
              <th>What we found</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.requirement_id}>
                <td>
                  <span className={`badge ${f.verdict === "pass" ? "ok" : f.verdict === "warning" ? "warn" : f.verdict === "fail" ? "bad" : "muted"}`}>
                    {f.verdict === "not_evaluable" ? "n/a" : f.verdict}
                  </span>
                </td>
                <td>{checkName(f.requirement_id, reqText[f.requirement_id])}</td>
                <td className="reason">{f.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shots.length > 0 && (
        <>
          <h2>Screenshots</h2>
          <div className="shots">
            {shots.map((s) => (
              <a key={s.name} href={`/r/${token}/shot/${s.name}`} target="_blank" rel="noreferrer" className="shot card">
                <span className="mono">{s.name.replace(/^viewport-/, "").replace(/\.jpg$/, "")}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/r/${token}/shot/${s.name}`} alt={`${s.name} screenshot of ${url}`} loading="lazy" />
              </a>
            ))}
          </div>
        </>
      )}

      <h2>Integrity</h2>
      <div className="card">
        <p className="mono wrapmono">
          generated {new Date(row.generated_at).toISOString()} · {report.profile_version}
          <br />
          report_hash {row.report_hash}
          <br />
          signature {String(row.signature).slice(0, 48)}…
        </p>
        <p>
          <a href={`/r/${token}/json`}>Download JSON</a> · <Link href="/#check">Check another site — $3</Link>
        </p>
      </div>
      <Footer />
    </div>
  );
}
