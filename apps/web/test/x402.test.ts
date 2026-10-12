import { test } from "node:test";
import assert from "node:assert/strict";
import { x402Config, buildRequirements, decodePaymentHeader, precheck, facilitatorCall, paymentRequiredHeaderV2 } from "../src/lib/x402";

const PAY = "0x1111111111111111111111111111111111111111";
test("off without X402_PAY_TO", () => { assert.equal(x402Config({}), null); assert.equal(x402Config({ X402_PAY_TO: "nope" }), null); });
test("requirements and payment flow", async () => {
  const cfg = x402Config({ X402_PAY_TO: PAY })!;
  assert.equal(cfg.network, "base");
  const req = buildRequirements(cfg, 300, "https://siteverify.dev/v1/checks", "Quick");
  assert.equal(req.maxAmountRequired, "3000000");
  assert.ok(JSON.parse(Buffer.from(paymentRequiredHeaderV2(req), "base64").toString()).accepts[0].network === "eip155:8453");
  const auth = { from: "0x2222222222222222222222222222222222222222", to: PAY, value: "3000000", validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: "0x" + "ab".repeat(32) };
  const hdr = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base", payload: { signature: "0xsig", authorization: auth } })).toString("base64");
  const p = decodePaymentHeader(hdr)!;
  assert.equal(precheck(p, req), null);
  assert.equal(precheck({ ...p, payload: { ...p.payload, authorization: { ...auth, value: "2999999" } } }, req), "insufficient_amount");
  assert.equal(precheck({ ...p, payload: { ...p.payload, authorization: { ...auth, to: auth.from } } }, req), "wrong_recipient");
  const seen: string[] = [];
  const fake = (async (url: string, init: RequestInit) => { seen.push(url); const b = JSON.parse(String(init.body)); assert.equal(b.paymentRequirements.payTo, PAY); return new Response(JSON.stringify(url.endsWith("verify") ? { isValid: true } : { success: true, transaction: "0xtx" })); }) as unknown as typeof fetch;
  assert.equal((await facilitatorCall(cfg, "verify", p, req, fake)).isValid, true);
  assert.equal((await facilitatorCall(cfg, "settle", p, req, fake)).transaction, "0xtx");
  assert.deepEqual(seen, ["https://facilitator.payai.network/verify", "https://facilitator.payai.network/settle"]);
});
