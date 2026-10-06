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

for (const name of MCP_TOOLS.map((t) => t.name)) {
  test(`tools/call ${name} without a key → same 401 as before`, async () => {
    const res = await POST(rpc("tools/call", { name, arguments: {} }, 3));
    assert.equal(res.status, 401);
    const j = await res.json();
    assert.equal(j.error.code, "unauthorized");
    assert.equal(j.error.message, "MCP requires Bearer fv_live_ API key");
  });
}

test("tools/call with a malformed key → 401", async () => {
  const req = new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not_a_key" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "verify_create_order" } }),
  });
  const res = await POST(req);
  assert.equal(res.status, 401);
});

test("unknown method / empty body without a key → 401", async () => {
  assert.equal((await POST(rpc("resources/list", {}, 5))).status, 401);
  const empty = new Request(URL_, { method: "POST", body: "{}" });
  assert.equal((await POST(empty)).status, 401);
});
