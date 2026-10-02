import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./crypto.js";

const root = process.env.EVIDENCE_DIR || "./evidence";

export async function storeEvidence(
  jobId: string,
  name: string,
  data: Buffer,
): Promise<{ uri: string; content_hash: string }> {
  const dir = path.join(root, jobId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(file, data);
  return { uri: `file://${file}`, content_hash: sha256(data) };
}
