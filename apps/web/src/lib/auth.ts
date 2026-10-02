import { query } from "./db";
import { verifyApiKey } from "./crypto";

export type AuthContext = {
  clientId: string;
  tenantId: string;
  scopes: string[];
  keyPrefix: string;
  rateLimit: number;
};

export async function authenticateBearer(
  authorization: string | null,
): Promise<AuthContext | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice("Bearer ".length).trim();
  if (!raw.startsWith("fv_live_")) return null;
  const prefix = raw.slice(0, "fv_live_".length + 8);
  const { rows } = await query<{
    id: string;
    tenant_id: string;
    key_hash: string;
    scopes: string[];
    key_prefix: string;
    rate_limit: number;
    revoked_at: string | null;
    expires_at: string | null;
  }>(
    `SELECT id, tenant_id, key_hash, scopes, key_prefix, rate_limit, revoked_at, expires_at
     FROM api_clients WHERE key_prefix = $1 LIMIT 5`,
    [prefix],
  );
  for (const row of rows) {
    if (row.revoked_at) continue;
    if (row.expires_at && new Date(row.expires_at) < new Date()) continue;
    if (await verifyApiKey(row.key_hash, raw)) {
      return {
        clientId: row.id,
        tenantId: row.tenant_id,
        scopes: row.scopes,
        keyPrefix: row.key_prefix,
        rateLimit: row.rate_limit,
      };
    }
  }
  return null;
}

export function requireScope(auth: AuthContext, scope: string): boolean {
  return auth.scopes.includes(scope) || auth.scopes.includes("*");
}
