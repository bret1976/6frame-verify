import { NextResponse } from "next/server";
import { API_VERSION } from "@6frame/config";
import { requestId } from "./crypto";
import { signupUrl, SIGNUP_HINT } from "./links";

export function jsonOk<T>(body: T, init?: { status?: number; requestId?: string }) {
  const rid = init?.requestId ?? requestId();
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "X-Request-Id": rid,
      "X-API-Version": API_VERSION,
      "Cache-Control": "no-store",
    },
  });
}

export function jsonError(
  code: string,
  message: string,
  opts?: {
    status?: number;
    retryable?: boolean;
    details?: unknown;
    requestId?: string;
  },
) {
  const rid = opts?.requestId ?? requestId();
  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id: rid,
        retryable: opts?.retryable ?? false,
        details: opts?.details,
      },
    },
    {
      status: opts?.status ?? 400,
      headers: {
        "X-Request-Id": rid,
        "X-API-Version": API_VERSION,
        "Cache-Control": "no-store",
      },
    },
  );
}

/** 401 that tells the caller exactly how to get a key. */
export function unauthorized(message = "Bearer fv_live_ API key required") {
  const url = signupUrl();
  return jsonError("unauthorized", `${message}. ${SIGNUP_HINT} Sign up: ${url}`, {
    status: 401,
    details: { signup_url: url, signup_api: "POST /v1/keys", mcp_signup_tool: "verify_signup" },
  });
}
