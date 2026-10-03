import { NextResponse } from "next/server";
import { quoteReuseSummary } from "@/lib/quote-reuse";

export const dynamic = "force-dynamic";

/** Ops-only JSON summary for quote-reuse-v1 (no HTML UI). */
export async function GET() {
  const body = await quoteReuseSummary();
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
