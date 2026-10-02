#!/usr/bin/env node
/**
 * 6frame-verify CLI skeleton
 * Env: SIXFRAME_VERIFY_API_KEY (fv_live_...), SIXFRAME_VERIFY_BASE_URL
 * Never accepts a Stripe secret key.
 */
const base = process.env.SIXFRAME_VERIFY_BASE_URL || "https://api.6frameverify.com";
const key = process.env.SIXFRAME_VERIFY_API_KEY;

const [cmd, ...rest] = process.argv.slice(2);

async function api(path: string, init?: RequestInit) {
  if (!key) {
    console.error("Set SIXFRAME_VERIFY_API_KEY");
    process.exit(1);
  }
  if (key.startsWith("sk_")) {
    console.error("Refusing Stripe secret key. Use fv_live_ API key only.");
    process.exit(1);
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key as string}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  console.log(text);
  if (!res.ok) process.exit(1);
}

async function main() {
  switch (cmd) {
    case "capabilities":
      await api("/v1/capabilities");
      break;
    case "quote":
      await api("/v1/quotes", {
        method: "POST",
        headers: { "Idempotency-Key": rest[1] || crypto.randomUUID() },
        body: rest[0] || "{}",
      });
      break;
    case "buy":
      await api("/v1/orders", {
        method: "POST",
        headers: { "Idempotency-Key": rest[1] || crypto.randomUUID() },
        body: rest[0] || "{}",
      });
      break;
    case "submit":
      await api("/v1/jobs", {
        method: "POST",
        headers: { "Idempotency-Key": rest[1] || crypto.randomUUID() },
        body: rest[0] || "{}",
      });
      break;
    case "watch": {
      const id = rest[0];
      if (!id) throw new Error("job id required");
      for (;;) {
        const res = await fetch(`${base}/v1/jobs/${id}`, {
          headers: { authorization: `Bearer ${key as string}` },
        });
        const j = (await res.json()) as { status?: string };
        console.log(j.status || JSON.stringify(j));
        if (
          [
            "completed",
            "completed_with_warnings",
            "failed_platform",
            "rejected_policy",
            "cancelled",
            "expired",
          ].includes(j.status || "")
        )
          break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      break;
    }
    case "report":
      await api(`/v1/jobs/${rest[0]}/report`);
      break;
    default:
      console.log(`Usage: 6frame-verify <capabilities|quote|buy|submit|watch|report>
Base: ${base}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
