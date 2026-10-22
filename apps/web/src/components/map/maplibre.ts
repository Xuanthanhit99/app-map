import * as maplibregl from "maplibre-gl";

/**
 * MapLibre GL v6 resolves its worker from import.meta.url, which the bundler rewrites.
 * Serve the worker matching the installed version same-origin from /vendor
 * (copied by scripts/copy-maplibre-worker.mjs) so CSP `worker-src 'self'` holds.
 */
let configured = false;
export function configureMaplibreWorker(): void {
  if (configured || typeof window === "undefined") return;
  maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`);
  configured = true;
}
