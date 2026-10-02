/** Thin fetch client — generated OpenAPI SDKs can replace this later. */
export type ClientOptions = { baseUrl: string; apiKey: string };

export function createClient(opts: ClientOptions) {
  async function req(path: string, init?: RequestInit & { idempotencyKey?: string }) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    };
    if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      const errBody = json as { error?: { message?: string } };
      throw Object.assign(new Error(errBody?.error?.message || res.statusText), {
        status: res.status,
        body: json,
      });
    }
    return json;
  }
  return {
    capabilities: () => req("/v1/capabilities"),
    quote: (body: unknown, idempotencyKey: string) =>
      req("/v1/quotes", { method: "POST", body: JSON.stringify(body), idempotencyKey }),
    order: (body: unknown, idempotencyKey: string) =>
      req("/v1/orders", { method: "POST", body: JSON.stringify(body), idempotencyKey }),
    job: (body: unknown, idempotencyKey: string) =>
      req("/v1/jobs", { method: "POST", body: JSON.stringify(body), idempotencyKey }),
    getJob: (id: string) => req(`/v1/jobs/${id}`),
    report: (id: string) => req(`/v1/jobs/${id}/report`),
  };
}
