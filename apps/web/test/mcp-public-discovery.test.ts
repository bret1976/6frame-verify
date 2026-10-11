import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handlePublicMcpMethod,
  isPublicMcpMethod,
  MCP_TOOLS,
  PUBLIC_MCP_METHODS,
} from "../src/lib/mcp-protocol";
import { POST } from "../src/app/mcp/route";

const URL_ = "http://localhost/mcp";
const rpc = (method: string, params?: unknown, id: number | undefined = 1) =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }),
  });

test("only discovery methods are public", () => {
  assert.deepEqual(
    [...PUBLIC_MCP_METHODS].sort(),
    ["initialize", "notifications/initialized", "ping", "tools/list"].sort(),
  );
  assert.equal(isPublicMcpMethod("tools/call"), false);
  assert.equal(isPublicMcpMethod(undefined), false);
  assert.equal(handlePublicMcpMethod({ method: "tools/call", params: { name: "verify_buy_credits" } }), null);
});

test("initialize without a key → 200 JSON-RPC result", async () => {
  const res = await POST(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.jsonrpc, "2.0");
  assert.equal(j.id, 1);
  assert.equal(j.result.protocolVersion, "2025-06-18");
  assert.equal(j.result.serverInfo.name, "6frame-verify");
  assert.ok(j.result.capabilities.tools);
});

test("notifications/initialized without a key → 202", async () => {
  const res = await POST(rpc("notifications/initialized", undefined, undefined));
  assert.equal(res.status, 202);
});

test("ping without a key → 200 empty result", async () => {
  const res = await POST(rpc("ping", undefined, 7));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { jsonrpc: "2.0", id: 7, result: {} });
});

test("tools/list without a key → 200 with all tools", async () => {
  const res = await POST(rpc("tools/list", {}, 2));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(
    j.result.tools.map((t: { name: string }) => t.name),
    MCP_TOOLS.map((t) => t.name),
  );
});

const KEYLESS = new Set(["verify_get_capabilities", "verify_signup", "verify_quote"]);

test("verify_get_capabilities works without a key", async () => {
  const res = await POST(rpc("tools/call", { name: "verify_get_capabilities", arguments: {} }, 3));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.notEqual(j.result.isError, true);
  const caps = JSON.parse(j.result.content[0].text);
  assert.ok(caps.signup.url.endsWith("/get-key"));
  assert.equal(caps.skus.website_quick.amount_cents, 300);
  assert.equal(caps.skus.credit_pack_9.amount_cents, 900);
  assert.equal(caps.skus.credit_pack_29.amount_cents, 2900);
});

test("verify_signup without email → tool error (no key needed, no DB hit)", async () => {
  const res = await POST(rpc("tools/call", { name: "verify_signup", arguments: {} }, 3));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.result.isError, true);
});

for (const name of MCP_TOOLS.map((t) => t.name).filter((n) => !KEYLESS.has(n))) {
  test(`tools/call ${name} without a key → tool error pointing to signup`, async () => {
    const res = await POST(rpc("tools/call", { name, arguments: {} }, 3));
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.result.isError, true);
    assert.match(j.result.content[0].text, /get-key/);
    assert.match(j.result.content[0].text, /verify_signup/);
  });
}

test("tools/call with a malformed key → tool error with signup link", async () => {
  const req = new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not_a_key" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "verify_check_site" } }),
  });
  const res = await POST(req);
  const j = await res.json();
  assert.equal(j.result.isError, true);
});

test("unknown method / empty body without a key → 401", async () => {
  assert.equal((await POST(rpc("resources/list", {}, 5))).status, 401);
  const empty = new Request(URL_, { method: "POST", body: "{}" });
  assert.equal((await POST(empty)).status, 401);
});
