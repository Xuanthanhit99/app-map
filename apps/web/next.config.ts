import path from "node:path";
import type { NextConfig } from "next";

const root = path.join(__dirname, "../..");
const tileHosts = ["https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://api.maptiler.com", ...(process.env.NEXT_PUBLIC_MAP_TILE_HOSTS ?? "").split(",").filter(Boolean)];

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${tileHosts.join(" ")}`,
  `connect-src 'self' ${tileHosts.join(" ")}`,
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  output: "standalone",
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};
export default config;
