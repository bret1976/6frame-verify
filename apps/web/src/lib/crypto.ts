import crypto from "node:crypto";
import argon2 from "argon2";

const KEY_PREFIX = "fv_live_";

export function generateApiKey(): { raw: string; prefix: string; secret: string } {
  const secret = crypto.randomBytes(24).toString("base64url");
  const prefix = secret.slice(0, 8);
  return { raw: `${KEY_PREFIX}${secret}`, prefix: `${KEY_PREFIX}${prefix}`, secret };
}

export async function hashApiKey(raw: string): Promise<string> {
  return argon2.hash(raw, { type: argon2.argon2id });
}

export async function verifyApiKey(hash: string, raw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, raw);
  } catch {
    return false;
  }
}

export function sha256(input: string | Buffer): string {
  return `sha256:${crypto.createHash("sha256").update(input).digest("hex")}`;
}

export function hmacSign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function signReport(reportJson: string, privateKeyPem?: string): string {
  if (privateKeyPem && privateKeyPem.includes("BEGIN")) {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(reportJson);
    sign.end();
    return `rsa-sha256:${sign.sign(privateKeyPem).toString("base64")}`;
  }
  // Fallback HMAC with API_ENCRYPTION_KEY / derived secret — still real crypto, not a fake unlock
  const key = privateKeyPem || process.env.API_ENCRYPTION_KEY || "dev-only-report-hmac";
  return `hmac-sha256:${hmacSign(key, reportJson)}`;
}

export function requestId(): string {
  return `req_${crypto.randomBytes(12).toString("hex")}`;
}
