import { NextResponse } from "next/server";

/** iOS universal links (/.well-known/apple-app-site-association via rewrite). 404 until APPLE_TEAM_ID is configured. */
export const dynamic = "force-dynamic";
export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  const bundle = process.env.IOS_BUNDLE_ID ?? "com.xuanthanhit99.reality";
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 404 });
  const paths = ["/dia-diem/*", "/hanh-trinh/*", "/dat-lai-mat-khau", "/xac-minh-email"];
  return NextResponse.json({ applinks: { details: [{ appIDs: [`${team}.${bundle}`], components: paths.map((p) => ({ "/": p })) }] } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
