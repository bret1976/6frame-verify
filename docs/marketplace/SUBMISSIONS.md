# Directory submissions — 6Frame Verify (prepared 2026-10-11)

Repo: https://github.com/bret1976/6frame-verify · Site: https://web-production-1cede.up.railway.app
MCP endpoint (Streamable HTTP): `https://web-production-1cede.up.railway.app/mcp`
Auth: optional `Authorization: Bearer fv_live_…` (keyless: `verify_get_capabilities`, `verify_quote`, `verify_signup`)
Registry name: `io.github.bret1976/6frame-verify` · Category: Testing / QA / Web / Developer tools
Contact: 6Frame Studio (Bret Jenny)

## Copy

**Name:** 6Frame Verify
**Tagline (≤60):** Pre-launch website QA in 60 seconds — for humans and agents
**Short (≤100):** Pre-launch website QA in 60s: real Chromium checks links, SEO, mobile, console. Free key, $3/check.
**Long:**
6Frame Verify loads a live URL in a real Chromium browser on desktop and mobile and checks what breaks launches:
HTTP status, broken links, title / meta description / H1, Open Graph social previews, mobile viewport and
horizontal overflow, console errors, load time, image alt text and favicon. It returns a shareable report page with
screenshots, a 0–100 score, a ready-to-launch verdict and an exact fix list.

Built for coding agents: call `verify_check_site` after deploying and before saying "done". `verify_signup` creates a
free key from an email (1 free Quick Check per day). After that, checks draw from prepaid credit or return a Stripe
checkout link for the human. Humans can buy a single $3 check on the homepage with no account.

**Tools:** verify_get_capabilities, verify_quote, verify_signup, verify_check_site, verify_get_job, verify_get_report,
verify_get_credits, verify_buy_credits (+ advanced: verify_create_order, verify_submit_job)
**Pricing:** free key = 1 Quick Check/day · $3 Quick Check · $12 Full Check (10 pages) · $9→$10 and $29→$35 credit packs
**Samples:** https://web-production-1cede.up.railway.app/samples
**Client config:**
```json
{ "mcpServers": { "6frame-verify": { "url": "https://web-production-1cede.up.railway.app/mcp",
  "headers": { "Authorization": "Bearer fv_live_..." } } } }
```

## Per-directory status

| Directory | How it accepts | Status | Bret action |
|---|---|---|---|
| Official MCP Registry (feeds PulseMCP, GitHub MCP Registry, Harbor, others) | `mcp-publisher` via GitHub OIDC | Ready-made workflow at `docs/marketplace/publish-mcp-registry.workflow.yml`. Our gh token lacks the `workflow` scope, so it couldn't be pushed into `.github/workflows/` | Move the file to `.github/workflows/` (GitHub web UI: add file, paste) → it runs and publishes v1.1.0. No secrets needed |
| mcp.directory | Keyless web form (GitHub URL + optional email) | See build log for submission result | None |
| MCP Market (mcpmarket.com/submit) | Web form: GitHub repo URL, reviewed | See build log | Possibly confirm email if they send one |
| mcp.so (mcp.so/submit) | Needs sign-in (GitHub/Google) → type "Remote Server", repo URL | Not submitted (login required) | Sign in, choose Remote Server, paste repo URL. Free tier is fine; skip the $39 option |
| Smithery (smithery.ai/new) | Needs Smithery login; "URL" method, paste MCP URL | Not submitted (login required) | Log in → New → URL `…/mcp` → namespace `6frame/verify`. Config schema: `{"type":"object","properties":{"apiKey":{"type":"string","description":"fv_live_ key (optional; get one free at /get-key)"}}}` |
| Glama (glama.ai/mcp/servers) | Indexes GitHub; claiming needs a GitHub login | `glama.json` (maintainer bret1976) added to repo | Log in with GitHub → Add server → repo URL → claim |
| PulseMCP | Manual submissions paused (Oct 2026); ingests the official registry | Covered by the registry publish | None; resubmit when they reopen |
