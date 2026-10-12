# Installing 6Frame Verify (for Cline and other agents)

6Frame Verify is a **remote** MCP server. Nothing to install or build.

1. Add it to your MCP settings (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "6frame-verify": {
      "type": "streamableHttp",
      "url": "https://web-production-1cede.up.railway.app/mcp"
    }
  }
}
```

2. Call `verify_get_capabilities` (no key needed) to confirm it works.
3. Get a free key: call `verify_signup` with the user's email (ask the user for it). Then add
   `"headers": { "Authorization": "Bearer fv_live_..." }` to the config above.
4. Run `verify_check_site` with `{ "url": "https://the-site-you-deployed" }`, then `verify_get_report`.

Free key = 1 Quick Check/day. After that the tool returns a Stripe checkout link for the human ($3 Quick, $12 Full) or uses prepaid credit.
