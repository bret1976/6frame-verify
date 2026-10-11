"use client";

import { useState } from "react";

type Result = { api_key: string; key_prefix: string; next?: { run_free_check?: string; mcp?: { url: string } } };

export function KeyForm() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/v1/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: hp }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.api_key) setRes(j);
      else setErr(j?.error?.message || "Could not create a key — please try again.");
    } catch {
      setErr("Network error — please try again.");
    }
    setBusy(false);
  }

  if (res) {
    return (
      <div className="card keyresult" data-testid="key-result">
        <h3>Your API key</h3>
        <p>Copy it now — it is shown only once.</p>
        <pre className="codeblock" data-testid="api-key">{res.api_key}</pre>
        <h3>Run your free check</h3>
        <pre className="codeblock">{res.next?.run_free_check}</pre>
        <h3>Use it from an agent (MCP)</h3>
        <pre className="codeblock">{`{
  "mcpServers": {
    "6frame-verify": {
      "url": "${res.next?.mcp?.url ?? "/mcp"}",
      "headers": { "Authorization": "Bearer ${res.api_key}" }
    }
  }
}`}</pre>
      </div>
    );
  }

  return (
    <form className="buybox card" onSubmit={submit}>
      <h3>Get a free API key</h3>
      <p>Includes 1 free Quick Check every day. No card needed.</p>
      <label>
        <span>Email</span>
        <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <input className="hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" aria-hidden="true" />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create my API key"}
      </button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}
