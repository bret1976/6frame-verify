import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { serverCard } from "@/lib/server-card";
import { ensureStripeDeposit } from "@/lib/x402-stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureStripeDeposit().catch(() => {});
  return NextResponse.json(serverCard(env().APP_BASE_URL), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
