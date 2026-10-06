import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { OFFERED_PROFILES, OFFERED_SKUS, offeredSkuCatalog } from "@6frame/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = env().APP_BASE_URL;
  const doc = {
    openapi: "3.1.0",
    info: {
      title: "6Frame Verify API",
      version: "1.0.0",
      description:
        "Paid agent-to-agent website acceptance-testing API. Jobs queue only after verified Stripe payment or credit reservation. Offered SKUs: website_quick ($3), website_full ($12), credit_pack ($100).",
      contact: { name: "6Frame Studio", url: "https://6framestudio.com" },
    },
    servers: [{ url: base }],
    "x-offered-skus": offeredSkuCatalog(),
    "x-offered-profiles": OFFERED_PROFILES,
    paths: {
      "/v1/capabilities": {
        get: {
          summary: "List profiles, SKUs, limits",
          security: [{ bearerAuth: [] }, {}],
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/profiles/{slug}": {
        get: { summary: "Profile contract", responses: { "200": { description: "OK" } } },
      },
      "/v1/quotes": {
        post: {
          summary: "Create quote",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["profile", "input"],
                  properties: {
                    profile: {
                      type: "object",
                      properties: {
                        slug: { type: "string", enum: [...OFFERED_PROFILES] },
                        version: { type: "string" },
                      },
                    },
                    sku: { type: "string", enum: [...OFFERED_SKUS] },
                    input: { type: "object" },
                  },
                },
              },
            },
          },
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Quote" },
            "422": { description: "Invalid input, or SKU/profile not currently offered" },
          },
        },
      },
      "/v1/orders": {
        post: {
          summary: "Create paid order from quote",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Order" }, "503": { description: "Stripe not configured" } },
        },
      },
      "/v1/orders/{id}": {
        get: {
          summary: "Order payment state",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Order" } },
        },
      },
      "/v1/orders/{id}/payment-session": {
        post: {
          summary: "Create Stripe Checkout session",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Checkout" } },
        },
      },
      "/v1/jobs": {
        post: {
          summary: "Submit verification job (requires paid order)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "201": { description: "Queued" },
            "402": { description: "Payment required — unpaid jobs refused" },
          },
        },
      },
      "/v1/jobs/{id}": {
        get: {
          summary: "Job status",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Job" } },
        },
      },
      "/v1/jobs/{id}/cancel": {
        post: {
          summary: "Cancel before worker starts",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Cancelled" } },
        },
      },
      "/v1/jobs/{id}/report": {
        get: {
          summary: "Signed terminal report",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Report" } },
        },
      },
      "/v1/jobs/{id}/evidence": {
        get: {
          summary: "Evidence descriptors",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Evidence" } },
        },
      },
      "/v1/webhooks/stripe": {
        post: {
          summary: "Stripe webhook (raw body signature verification)",
          responses: { "200": { description: "Received" } },
        },
      },
      "/v1/healthz": { get: { summary: "Liveness", responses: { "200": { description: "OK" } } } },
      "/v1/readyz": { get: { summary: "Readiness", responses: { "200": { description: "OK" } } } },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "fv_live_",
        },
      },
    },
  };
  return NextResponse.json(doc, {
    headers: { "Cache-Control": "public, max-age=60", "Content-Type": "application/json" },
  });
}
