import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { offeredSkuCatalog } from "@6frame/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = env().APP_BASE_URL;
  const card = {
    name: "6Frame Verify",
    description:
      "Pre-launch website QA in ~60s: real Chromium on desktop + mobile checks HTTP status, broken links, SEO/social tags, mobile overflow, console errors; signed report with screenshots. Free key (1 Quick Check/day); $3 Quick, $12 Full.",
    url: `${base}/v1`,
    provider: {
      organization: "6Frame Studio",
      url: "https://6framestudio.com",
    },
    version: "1.2.0",
    documentationUrl: `${base}/docs`,
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["Bearer"],
      credentials: `fv_live_ API keys — self-serve: POST ${base}/v1/keys {email} or ${base}/get-key`,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "quote_acceptance_test",
        name: "Quote acceptance test",
        description: "Validate input and return a deterministic expiring quote",
        tags: ["verify", "quote", "billing"],
        examples: ["Quote a website-acceptance Quick Check for https://example.com"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "run_website_acceptance_test",
        name: "Run website acceptance test",
        description:
          "After payment, run Playwright website acceptance against a public HTTPS URL",
        tags: ["verify", "website", "playwright"],
        examples: ["Verify https://preview.example.com against my brief"],
      },
      {
        id: "buy_prepaid_credits",
        name: "Buy prepaid credits",
        description:
          "Buy a credit pack ($9 → $10 or $29 → $35) via Stripe Checkout; checks then draw from credit automatically",
        tags: ["verify", "billing", "credits"],
      },
      {
        id: "get_acceptance_report",
        name: "Get acceptance report",
        description: "Fetch signed terminal report and evidence descriptors",
        tags: ["verify", "report"],
      },
    ],
    pricing: offeredSkuCatalog(),
    endpoints: {
      openapi: `${base}/.well-known/openapi.json`,
      mcp: `${base}/mcp`,
      rest: `${base}/v1`,
    },
  };
  return NextResponse.json(card, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
