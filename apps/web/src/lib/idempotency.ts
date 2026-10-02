import type { AuthContext } from "./auth";
import { query } from "./db";
import { sha256 } from "./crypto";

export async function loadIdempotentResponse(
  auth: AuthContext,
  key: string,
  method: string,
  path: string,
) {
  const { rows } = await query<{
    response_status: number;
    response_body: unknown;
  }>(
    `SELECT response_status, response_body FROM idempotency_keys
     WHERE tenant_id=$1 AND key=$2 AND method=$3 AND path=$4`,
    [auth.tenantId, key, method, path],
  );
  return rows[0] ?? null;
}

export async function saveIdempotentResponse(
  auth: AuthContext,
  key: string,
  method: string,
  path: string,
  requestBody: unknown,
  status: number,
  responseBody: unknown,
) {
  await query(
    `INSERT INTO idempotency_keys (tenant_id, key, method, path, request_hash, response_status, response_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, key, method, path) DO NOTHING`,
    [
      auth.tenantId,
      key,
      method,
      path,
      sha256(JSON.stringify(requestBody ?? {})),
      status,
      JSON.stringify(responseBody),
    ],
  );
}
