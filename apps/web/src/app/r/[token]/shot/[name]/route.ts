import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string; name: string }> }) {
  const { token, name } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9._-]{1,80}$/i.test(name)) {
    return new Response("not found", { status: 404 });
  }
  const { rows } = await query(
    `SELECT b.data, b.content_type FROM evidence_blobs b JOIN jobs j ON j.id = b.job_id
     WHERE j.public_token=$1 AND b.name=$2 AND b.content_type LIKE 'image/%'`,
    [token, name],
  );
  if (!rows[0]) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].data as Buffer), {
    headers: {
      "content-type": rows[0].content_type,
      "cache-control": "public, max-age=86400, immutable",
      "x-robots-tag": "noindex",
    },
  });
}
