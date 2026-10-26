/** MapLibre options that cut GPU and main-thread work without changing the data on the map. */
export type MapRenderOptions = {
  /** Tiles appear without a fade. This also satisfies prefers-reduced-motion. */
  fadeDuration: 0;
  /** Cap retina rendering at 2×. A 3× phone does not allocate a 3× WebGL buffer. */
  pixelRatio: number;
  /** CJK ideographs use a local face. Vietnamese and Latin still come from the style or the symbol layer. */
  localIdeographFontFamily: string;
};

export function mapRenderOptions(input: { devicePixelRatio?: number } = {}): MapRenderOptions {
  const reported = input.devicePixelRatio ?? (typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1);
  const pixelRatio = Math.min(2, Math.max(1, reported));
  return {
    fadeDuration: 0,
    pixelRatio,
    localIdeographFontFamily: "Be Vietnam Pro, system-ui, sans-serif",
  };
}
