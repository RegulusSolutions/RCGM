import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";

const HOP_BY_HOP_REQUEST_HEADERS = new Set(["host", "connection", "content-length"]);

async function forward(req: NextRequest, path: string[]) {
  const target = new URL(`/api/${path.join("/")}${req.nextUrl.search}`, API_BASE_URL);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "transfer-encoding") return;
    // set-cookie is handled specially below (may be multiple values)
    if (key.toLowerCase() === "set-cookie") return;
    responseHeaders.set(key, value);
  });

  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  const body = await upstream.arrayBuffer();
  const res = new NextResponse(body, { status: upstream.status, headers: responseHeaders });
  for (const cookie of setCookie) res.headers.append("Set-Cookie", cookie);
  return res;
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  return forward(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: RouteParams) {
  return forward(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return forward(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: RouteParams) {
  return forward(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return forward(req, (await params).path);
}
