import { NextResponse } from "next/server";

/**
 * Android App Links verification (/.well-known/assetlinks.json via rewrite).
 * Served only when the signing certificate fingerprints are configured; otherwise 404, so links
 * truthfully open in the browser instead of claiming an app association that cannot verify.
 */
export const dynamic = "force-dynamic";
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE ?? "com.xuanthanhit99.reality";
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (!fingerprints.length) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 404 });
  return NextResponse.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } }], { headers: { "Cache-Control": "public, max-age=3600" } });
}
