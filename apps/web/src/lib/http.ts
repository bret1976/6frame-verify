import { NextResponse } from "next/server";
import { API_VERSION } from "@6frame/config";
import { requestId } from "./crypto";

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
