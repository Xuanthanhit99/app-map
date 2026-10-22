// MapLibre GL v6 ships its worker as a separate ES module resolved from import.meta.url,
// which the Next bundler rewrites. Serve the exact worker matching the installed version
// from /vendor so it is same-origin (CSP worker-src 'self') and cache-busted by version.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const out = join(import.meta.dirname, "..", "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(join(dirname(pkgPath), "dist", "maplibre-gl-worker.mjs"), join(out, `maplibre-gl-worker-${version}.mjs`));
console.log(`maplibre worker ${version} -> public/vendor`);
