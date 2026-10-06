import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { offeredSkuCatalog } from "@6frame/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = env().APP_BASE_URL;
  const card = {
    name: "6Frame Verify",
    description:
      "Paid agent-to-agent website acceptance-testing. Prove a website meets the brief before delivery.",
    url: `${base}/v1`,
    provider: {
      organization: "6Frame Studio",
      url: "https://6framestudio.com",
    },
    version: "1.0.0",
    documentationUrl: `${base}/docs`,
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["Bearer"],
      credentials: "fv_live_ API keys — contact operator / create via admin",
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
