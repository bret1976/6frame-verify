/**
 * Stripe as the x402 payee: USDC on Base goes to a Stripe crypto deposit address and is
 * recorded as a PaymentIntent (crypto, transaction_verification) so it lands in the Stripe balance.
 * Enabled with X402_STRIPE_DEPOSIT=1 (and no X402_PAY_TO override). Uses the app's STRIPE_SECRET_KEY.
 */
import { query } from "./db";
import { setStripeDepositAddress } from "./x402";

const PREVIEW = process.env.X402_STRIPE_API_VERSION || "2026-05-27.preview";
let lastError: string | null = null;
let lastAttempt = 0;

async function stripeFetch(path: string, form: Record<string, string>, idem?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": PREVIEW,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) throw new Error(`${j.error?.code ?? r.status}: ${j.error?.message ?? "stripe error"}`);
  return j;
}

export function stripeDepositEnabled() {
  return process.env.X402_STRIPE_DEPOSIT === "1" && !process.env.X402_PAY_TO;
}

/** Load (or create once) the Base deposit address. Safe to call on every request. */
export async function ensureStripeDeposit(): Promise<void> {
  if (!stripeDepositEnabled()) return;
  const { rows } = await query<{ v: { address: string } }>(`SELECT v FROM app_kv WHERE k='x402_stripe_deposit_base'`);
  if (rows[0]?.v?.address) {
    setStripeDepositAddress(rows[0].v.address);
    return;
  }
  if (Date.now() - lastAttempt < 60_000) return;
  lastAttempt = Date.now();
  try {
    const d = await stripeFetch("crypto/deposit_addresses", { network: "base" });
    const address = String(d.address ?? d.deposit_address ?? d.crypto_address ?? "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`unexpected deposit address response (keys: ${Object.keys(d).join(",")})`);
    await query(`INSERT INTO app_kv (k, v) VALUES ('x402_stripe_deposit_base', $1) ON CONFLICT (k) DO NOTHING`, [JSON.stringify({ address, id: d.id ?? null })]);
    setStripeDepositAddress(address);
    lastError = null;
  } catch (e) {
    lastError = (e as Error).message;
  }
}

export function stripeDepositStatus() {
  return { enabled: stripeDepositEnabled(), last_error: lastError };
}

/** Record a settled tx as a Stripe PaymentIntent. Never throws. */
export async function recordStripePayment(payId: string, txHash: string, cents: number, meta: Record<string, string>) {
  if (!stripeDepositEnabled() || !txHash) return;
  try {
    const form: Record<string, string> = {
      amount: String(cents),
      currency: "usd",
      confirm: "true",
      "payment_method_data[type]": "crypto",
      "allowed_payment_method_types[]": "crypto",
      "payment_method_options[crypto][mode]": "transaction_verification",
      "payment_method_options[crypto][transaction_verification_options][network]": "base",
      "payment_method_options[crypto][transaction_verification_options][transaction_hash]": txHash,
      description: "6Frame Verify — agent x402 payment",
    };
    for (const [k, v] of Object.entries(meta)) form[`metadata[${k}]`] = v;
    const pi = await stripeFetch("payment_intents", form, `x402-${txHash}`);
    await query(`UPDATE x402_payments SET stripe_payment_intent=$1 WHERE id=$2`, [pi.id, payId]);
  } catch (e) {
    await query(`UPDATE x402_payments SET stripe_error=$1 WHERE id=$2`, [(e as Error).message.slice(0, 500), payId]).catch(() => {});
  }
}
