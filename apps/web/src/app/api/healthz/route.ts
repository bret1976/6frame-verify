import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, service: "6frame-verify", ts: new Date().toISOString() });
}
