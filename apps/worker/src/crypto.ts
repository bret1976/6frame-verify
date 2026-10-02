import crypto from "node:crypto";

export function sha256(input: string | Buffer): string {
  return `sha256:${crypto.createHash("sha256").update(input).digest("hex")}`;
}

export function signReport(reportJson: string): string {
  const pem = process.env.REPORT_SIGNING_PRIVATE_KEY;
  if (pem && pem.includes("BEGIN")) {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(reportJson);
    sign.end();
    return `rsa-sha256:${sign.sign(pem).toString("base64")}`;
  }
  const key = process.env.API_ENCRYPTION_KEY || "dev-only-report-hmac";
  return `hmac-sha256:${crypto.createHmac("sha256", key).update(reportJson).digest("hex")}`;
}

export function hmacSign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
