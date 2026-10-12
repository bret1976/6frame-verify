import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { serverCard } from "@/lib/server-card";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(serverCard(env().APP_BASE_URL), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
