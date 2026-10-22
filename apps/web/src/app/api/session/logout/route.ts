import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";
import { clearSessionCookies } from "@/lib/session";

export async function POST() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (token) await fetch(`${API_URL}/v1/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => undefined);
  await clearSessionCookies();
  return new NextResponse(null, { status: 204 });
}
