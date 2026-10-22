import { NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { setSessionCookies } from "@/lib/session";
import { forwardHeaders } from "@/lib/forward";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const r = await fetch(`${API_URL}/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", ...forwardHeaders(request) }, body: JSON.stringify({ ...body, client: "web" }), cache: "no-store" });
  const data = await r.json().catch(() => ({ error: "API_UNREACHABLE" }));
  if (!r.ok) return NextResponse.json({ error: data.error, details: data.details }, { status: r.status });
  await setSessionCookies(data.tokens);
  return NextResponse.json({ user: data.user }, { status: 201 });
}
