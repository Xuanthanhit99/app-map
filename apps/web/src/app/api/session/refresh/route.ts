import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_COOKIE } from "@/lib/config";
import { clearSessionCookies, refreshWith, setSessionCookies } from "@/lib/session";

/** Called by the client when the proxy reports SESSION_EXPIRED. Rotates the single-use refresh token. */
export async function POST() {
  const refresh = (await cookies()).get(REFRESH_COOKIE)?.value;
  const tokens = refresh ? await refreshWith(refresh) : null;
  if (!tokens) { await clearSessionCookies(); return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 }); }
  await setSessionCookies(tokens);
  return new NextResponse(null, { status: 204 });
}
