import localFont from "next/font/local";

/**
 * Be Vietnam Pro, self-hosted, woff2 only.
 * next/font applies one unicode-range to every file in a call, so each subset is its own family.
 * The stack in globals.css is vietnamese, then latin-ext, then latin: the browser uses the first
 * family that contains the glyph. Vietnamese diacritics stay on the vietnamese files.
 * Only the two families used on every screen are preloaded. latin-ext stays available and is not
 * on the initial preload list.
 * Paths are literal so the Next font compiler can see them.
 */
export const fontVietnamese = localFont({
  src: [
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: true,
  variable: "--font-vietnamese",
  adjustFontFallback: false,
});

export const fontLatinExt = localFont({
  src: [
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-ext-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-ext-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-latin-ext",
  adjustFontFallback: false,
});

export const fontLatin = localFont({
  src: [
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: true,
  variable: "--font-latin",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const fontVariableClass = `${fontVietnamese.variable} ${fontLatinExt.variable} ${fontLatin.variable}`;
