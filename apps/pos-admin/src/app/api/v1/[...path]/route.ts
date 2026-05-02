/**
 * Server-side proxy that forwards /api/v1/* → POS_API_URL/v1/*
 *
 * This lets client components reach pos-api via the same origin, avoiding
 * cross-origin issues. The proxy attaches Authorization from the forwarded
 * header so client components can pass the posJwt directly.
 *
 * Usage: fetch("/api/v1/menu/tree", { headers: { Authorization: "Bearer ..." }})
 */

import { type NextRequest, NextResponse } from "next/server";

const POS_API_URL = process.env["POS_API_URL"] ?? "http://localhost:3002";

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
  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
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
