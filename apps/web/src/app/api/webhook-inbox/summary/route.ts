import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { webhookInboxSummary } from "@/lib/webhook-inbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ops-only JSON summary for webhook-inbox-v1 (counts only, no HTML UI). */
export async function GET() {
  const body = await webhookInboxSummary(query);
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
