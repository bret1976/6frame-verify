import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listSamples } from "@/lib/samples";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  const now = new Date();
  const pages = ["", "/pricing", "/samples", "/docs", "/get-key", "/terms", "/privacy", "/acceptable-use"].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  const samples = (await listSamples(12)).map((s) => ({ url: `${base}/r/${s.token}`, lastModified: new Date(s.generated_at), priority: 0.4 }));
  return [...pages, ...samples];
}
