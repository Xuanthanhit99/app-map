import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAVY_AMBER } from "../src/theme/navy-amber";

const css = readFileSync(resolve(__dirname, "../apps/web/src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const v = (name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(root)?.[1]?.toUpperCase();

/** sRGB relative luminance contrast (WCAG 2.x). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe("Night Chart palette: web and mobile share one visual language", () => {
  const map: Record<string, keyof typeof NAVY_AMBER> = {
    bg: "bg", surface: "surface", "surface-2": "surface2", ink: "ink", "ink-2": "ink2", "ink-3": "ink3", line: "line", "line-strong": "lineStrong",
    accent: "accent", "accent-strong": "accentStrong", "on-accent": "onAccent", info: "info", positive: "positive", caution: "caution", avoid: "avoid",
    danger: "danger", blocked: "blocked", conflict: "conflict", unknown: "unknown", offline: "offline", focus: "focus",
  };
  it.each(Object.entries(map))("web --%s equals the shared token", (cssName, key) => {
    expect(v(cssName)).toBe(NAVY_AMBER[key].toUpperCase());
  });
  it("text and state colours meet WCAG AA (4.5:1) on every surface", () => {
    for (const surface of [NAVY_AMBER.bg, NAVY_AMBER.surface, NAVY_AMBER.surface2]) {
      for (const fg of [NAVY_AMBER.ink, NAVY_AMBER.ink2, NAVY_AMBER.ink3, NAVY_AMBER.accent, NAVY_AMBER.info, NAVY_AMBER.positive, NAVY_AMBER.caution, NAVY_AMBER.avoid, NAVY_AMBER.danger, NAVY_AMBER.blocked, NAVY_AMBER.conflict, NAVY_AMBER.unknown, NAVY_AMBER.offline]) {
        expect(contrast(fg, surface), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(NAVY_AMBER.onAccent, NAVY_AMBER.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
