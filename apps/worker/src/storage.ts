import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./crypto.js";
import { query } from "./db.js";

const root = process.env.EVIDENCE_DIR || "./evidence";
/** Max bytes persisted to Postgres per evidence item (web renders these on report pages). */
const MAX_DB_BYTES = Number(process.env.EVIDENCE_MAX_DB_BYTES || 4_000_000);

function contentTypeFor(name: string): string {
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

export async function storeEvidence(
  jobId: string,
  name: string,
  data: Buffer,
  opts?: { persistToDb?: boolean },
): Promise<{ uri: string; content_hash: string; in_db: boolean }> {
  const content_hash = sha256(data);
  try {
    const dir = path.join(root, jobId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), data);
  } catch (e) {
    console.warn("[worker] local evidence write failed", name, e instanceof Error ? e.message : e);
  }
  let in_db = false;
  if (opts?.persistToDb !== false && data.length <= MAX_DB_BYTES) {
    await query(
      `INSERT INTO evidence_blobs (job_id, name, content_type, content_hash, byte_size, data)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (job_id, name) DO UPDATE SET data=EXCLUDED.data, content_hash=EXCLUDED.content_hash,
         byte_size=EXCLUDED.byte_size, content_type=EXCLUDED.content_type`,
      [jobId, name, contentTypeFor(name), content_hash, data.length, data],
    );
    in_db = true;
  }
  return { uri: in_db ? `db://evidence_blobs/${jobId}/${name}` : `file://${path.join(root, jobId, name)}`, content_hash, in_db };
}
