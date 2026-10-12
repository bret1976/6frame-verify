/**
 * x402 (HTTP 402 + USDC) autonomous agent payments.
 * OFF unless X402_PAY_TO (receiving 0x address) is set.
 * Env: X402_PAY_TO, X402_NETWORK (base | base-sepolia, default base),
 *      X402_FACILITATOR_URL (default https://facilitator.payai.network — keyless, Base mainnet).
 * Pure helpers here (no DB) so they are unit-testable.
 */
export const USDC: Record<string, string> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};
const CHAIN_ID: Record<string, number> = { base: 8453, "base-sepolia": 84532 };

export type X402Config = { payTo: string; network: string; asset: string; facilitator: string };

let stripeDeposit: string | null = null;
export function setStripeDepositAddress(a: string | null) { stripeDeposit = a; }

export function x402Config(env: Record<string, string | undefined> = process.env): X402Config | null {
  const payTo = (env.X402_PAY_TO || (env.X402_STRIPE_DEPOSIT === "1" ? stripeDeposit : "") || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) return null;
  const network = (env.X402_NETWORK || "base").trim();
  if (!USDC[network]) return null;
  return { payTo, network, asset: USDC[network], facilitator: (env.X402_FACILITATOR_URL || "https://facilitator.payai.network").replace(/\/$/, "") };
}

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: unknown;
  extra: { name: string; version: string };
};

/** cents → USDC atomic units (6 decimals). */
export const centsToAtomic = (cents: number) => String(BigInt(cents) * 10000n);

export function buildRequirements(cfg: X402Config, cents: number, resource: string, description: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: centsToAtomic(cents),
    resource,
    description,
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: 600,
    asset: cfg.asset,
    extra: { name: cfg.network === "base" ? "USD Coin" : "USDC", version: "2" },
  };
}

/** 402 body (x402 v1) + v2-style header value. */
export function paymentRequiredBody(req: PaymentRequirements, error = "X-PAYMENT header is required") {
  return { x402Version: 1, error, accepts: [req] };
}
export function paymentRequiredHeaderV2(req: PaymentRequirements) {
  const v2 = {
    x402Version: 2,
    resource: { url: req.resource, description: req.description, mimeType: req.mimeType },
    accepts: [{ scheme: "exact", network: `eip155:${CHAIN_ID[req.network]}`, amount: req.maxAmountRequired, asset: req.asset, payTo: req.payTo, maxTimeoutSeconds: req.maxTimeoutSeconds, extra: req.extra }],
  };
  return Buffer.from(JSON.stringify(v2)).toString("base64");
}

export type DecodedPayment = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: { signature: string; authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string } };
};

export function decodePaymentHeader(h: string | null | undefined): DecodedPayment | null {
  if (!h) return null;
  try {
    const raw = h.trim().startsWith("{") ? h : Buffer.from(h.trim(), "base64").toString("utf8");
    const p = JSON.parse(raw) as DecodedPayment;
    if (!p?.payload?.authorization?.nonce || !p.payload.signature) return null;
    return p;
  } catch {
    return null;
  }
}

/** Cheap local checks before calling the facilitator. */
export function precheck(p: DecodedPayment, req: PaymentRequirements): string | null {
  const a = p.payload.authorization;
  if (p.scheme !== "exact") return "unsupported_scheme";
  if (p.network !== req.network) return "wrong_network";
  if (a.to.toLowerCase() !== req.payTo.toLowerCase()) return "wrong_recipient";
  if (BigInt(a.value) < BigInt(req.maxAmountRequired)) return "insufficient_amount";
  if (Number(a.validBefore) < Math.floor(Date.now() / 1000) + 5) return "authorization_expired";
  return null;
}

type FetchLike = typeof fetch;

export async function facilitatorCall(
  cfg: X402Config,
  op: "verify" | "settle",
  p: DecodedPayment,
  req: PaymentRequirements,
  f: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const r = await f(`${cfg.facilitator}/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: p.x402Version ?? 1, paymentPayload: p, paymentRequirements: req }),
    signal: AbortSignal.timeout(op === "settle" ? 60000 : 20000),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok && !("isValid" in j) && !("success" in j)) return { isValid: false, success: false, errorReason: `facilitator_http_${r.status}` };
  return j;
}

export function paymentResponseHeader(settle: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ success: !!settle.success, transaction: settle.transaction, network: settle.network, payer: settle.payer })).toString("base64");
}
