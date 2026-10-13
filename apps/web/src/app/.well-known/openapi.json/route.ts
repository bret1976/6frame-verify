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
        "Pre-launch website QA API (real Chromium, desktop + mobile). Free key with 1 Quick Check/day via POST /v1/keys. One-call checks via POST /v1/checks (free → credit → 402 with Stripe checkout_url). SKUs: website_quick ($3), website_full ($12), credit_pack_9 ($9 → $10), credit_pack_29 ($29 → $35).",
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
          summary: "Create order from quote (payment_mode checkout | payment_intent | credit — credit draws down prepaid balance)",
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
      "/v1/keys": {
        post: {
          summary: "Self-serve API key (shown once). Keyless; no email needed (email optional). Rate limited per IP/email. Includes 1 free Quick Check/day.",
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object", properties: { email: { type: "string", format: "email", description: "Optional" } } } } },
          },
          responses: { "201": { description: "Key created" }, "429": { description: "Rate limited" } },
        },
      },
      "/v1/checks": {
        post: {
          summary: "Run a website check in one call: today's free Quick Check, else prepaid credit, else 402 with Stripe checkout_url (job auto-runs after payment)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    sku: { type: "string", enum: ["website_quick", "website_full"], default: "website_quick" },
                    paths: { type: "array", items: { type: "string" }, maxItems: 10 },
                    brief: { type: "string" },
                    required_terms: { type: "array", items: { type: "string" } },
                    required_ctas: { type: "array", items: { type: "string" } },
                    forbidden_terms: { type: "array", items: { type: "string" } },
                    pay_with: { type: "string", enum: ["auto", "free", "credit", "checkout"], default: "auto" },
                    callback: { type: "object", properties: { url: { type: "string" }, secret: { type: "string" } } },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Queued: job_id, report_page, poll URLs" },
            "402": { description: "Payment required: checkout_url" },
            "429": { description: "Rate limited" },
          },
        },
      },
      "/v1/credits": {
        get: {
          summary: "Prepaid credit balance + ledger",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Balance" } },
        },
      },
      "/v1/credits/checkout": {
        post: {
          summary: "Buy a credit pack: credit_pack_9 ($9 → $10) or credit_pack_29 ($29 → $35). Returns Stripe Checkout URL; credits added on verified webhook",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pack: { type: "string", enum: ["credit_pack_9", "credit_pack_29"], default: "credit_pack_9" },
                    success_url: { type: "string", format: "uri" },
                    cancel_url: { type: "string", format: "uri" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Checkout session" }, "503": { description: "Stripe not configured" } },
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
