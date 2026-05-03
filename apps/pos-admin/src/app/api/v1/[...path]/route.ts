/**
 * Server-side proxy that forwards /api/v1/* → POS_API_URL/v1/*
 *
 * This lets client components reach pos-api via the same origin, avoiding
 * cross-origin issues. The proxy attaches Authorization from the forwarded
 * header so client components can pass the posJwt directly.
 *
 * Usage: fetch("/api/v1/menu/tree", { headers: { Authorization: "Bearer ..." }})
 *
 * Content-Type note: upstream headers are forwarded as-is so that CSV
 * downloads receive text/csv + Content-Disposition. Hop-by-hop headers
 * (transfer-encoding, content-encoding) are stripped because Next.js
 * handles chunking and fetch() already decodes the body.
 */

import { type NextRequest, NextResponse } from "next/server";

const POS_API_URL = process.env["POS_API_URL"] ?? "http://localhost:3002";

/** Headers that must not be forwarded (hop-by-hop or already handled). */
const STRIP_HEADERS = new Set([
  "transfer-encoding",
  "content-encoding",
  "connection",
  "keep-alive",
]);

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join("/");
  const search = req.nextUrl.search;
  const targetUrl = `${POS_API_URL}/v1/${path}${search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.get("Authorization")
        ? { Authorization: req.headers.get("Authorization")! }
        : {}),
    },
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      init.body = await req.text();
    } catch {
      // no body
    }
  }

  const upstream = await fetch(targetUrl, init);

  // Forward upstream headers, stripping hop-by-hop headers that Next.js
  // manages itself or that become invalid after the body is decoded by fetch().
  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  // fetch() automatically decodes any compressed body, so we read as text
  // which works for both JSON and CSV payloads.
  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxy(req, params);
}
