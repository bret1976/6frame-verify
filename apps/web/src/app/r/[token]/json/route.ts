import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response("not found", { status: 404 });
  const { rows } = await query(
    `SELECT r.artifact_json FROM reports r JOIN jobs j ON j.id=r.job_id WHERE j.public_token=$1 ORDER BY r.report_version DESC LIMIT 1`,
    [token],
  );
  if (!rows[0]) return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(rows[0].artifact_json, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="6frame-report-${token.slice(0, 8)}.json"`, "x-robots-tag": "noindex" },
  });
}
