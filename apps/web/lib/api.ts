"use client";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Same-origin client-side fetch against the Next.js reverse proxy (/api/*). */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  const method = (init.method ?? "GET").toUpperCase();

  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (MUTATING.has(method)) {
    finalHeaders.set("X-Requested-With", "rcgm-web");
  }

  const res = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...rest,
    method,
    headers: finalHeaders,
    credentials: "same-origin",
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message =
      (data as { error?: { message?: string }; detail?: { message?: string } | string })?.error?.message ??
      (typeof (data as { detail?: unknown })?.detail === "string"
        ? ((data as { detail?: string }).detail as string)
        : (data as { detail?: { message?: string } })?.detail?.message) ??
      res.statusText ??
      "Request failed";
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw new ApiError(res.status, message, code, (data as { error?: { details?: unknown } })?.error?.details);
  }

  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
