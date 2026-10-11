"use client";

import { useState } from "react";

export function BuyBox({ priceLabel }: { priceLabel: string }) {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, email, website: hp }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.checkout_url) {
        window.location.href = j.checkout_url;
        return;
      }
      setErr(j?.error?.message || "Something went wrong — please try again.");
    } catch {
      setErr("Network error — please try again.");
    }
    setBusy(false);
  }

  return (
    <form className="buybox card" onSubmit={submit} id="check">
      <h3>Check my site — {priceLabel}</h3>
      <p>One page, desktop + mobile, report in about a minute. Pay once, no account.</p>
      <label>
        <span>Site URL</span>
        <input
          type="text"
          inputMode="url"
          placeholder="https://your-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          autoComplete="url"
        />
      </label>
      <label>
        <span>Email (for your receipt and report link)</span>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <input className="hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" aria-hidden="true" />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Opening secure checkout…" : `Check my site — ${priceLabel}`}
      </button>
      {err && <p className="err">{err}</p>}
      <p className="fine">Secure checkout by Stripe. If our checker fails on our side, we refund.</p>
    </form>
  );
}
