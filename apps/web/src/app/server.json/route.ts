import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { MCP_SERVER_INFO } from "@/lib/mcp-protocol";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = env().APP_BASE_URL;
  return NextResponse.json(
    {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "io.github.bret1976/6frame-verify",
      title: MCP_SERVER_INFO.title,
      description: "Pre-launch website QA in 60s: real Chromium checks links, SEO, mobile, console. Free key, $3/check.",
      version: MCP_SERVER_INFO.version,
      repository: { url: "https://github.com/bret1976/6frame-verify", source: "github" },
      websiteUrl: base,
      remotes: [{ type: "streamable-http", url: `${base}/mcp` }],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
