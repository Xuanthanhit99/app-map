import { describe, expect, it } from "vitest";
import { mapRenderOptions } from "../apps/web/src/components/map/map-render";

describe("map render options", () => {
  it("caps the pixel ratio at 2 and never fades tiles", () => {
    expect(mapRenderOptions({ devicePixelRatio: 3 })).toMatchObject({ fadeDuration: 0, pixelRatio: 2 });
    expect(mapRenderOptions({ devicePixelRatio: 2 }).pixelRatio).toBe(2);
    expect(mapRenderOptions({ devicePixelRatio: 1 }).pixelRatio).toBe(1);
    expect(mapRenderOptions({ devicePixelRatio: 0.5 }).pixelRatio).toBe(1);
  });

  it("asks MapLibre to render CJK ideographs locally", () => {
    expect(mapRenderOptions().localIdeographFontFamily).toContain("Be Vietnam Pro");
  });
});
