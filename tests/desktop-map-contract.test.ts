import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("desktop map contract", () => {
  const source = readFileSync(resolve("apps/desktop/desktop-map.mjs"), "utf8");
  const html = readFileSync(resolve("apps/desktop/index.html"), "utf8");
  it("uses real cartography without fabricated markers or traffic", () => {
    expect(source).toContain("tiles.openfreemap.org/styles/dark");
    expect(source).not.toMatch(/addMarker\(|new globalThis\.maplibregl\.Marker\(/);
    expect(source).not.toContain("navigator.geolocation");
    expect(html).toContain('id="map"');
    expect(html).toContain('data-map-status');
  });
  it("exposes an explicit error state when map resources fail", () => {
    expect(source).toContain("LOAD_TIMEOUT");
    expect(source).toContain("STYLE_OR_TILE_ERROR");
    expect(source).toContain("LIBRARY_UNAVAILABLE");
  });
});
