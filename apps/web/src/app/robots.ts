import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/order/", "/api/", "/v1/"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
