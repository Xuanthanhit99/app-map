/**
 * REALITY "Night Chart" palette — dark navy + amber/gold, shared by web and mobile.
 * Owner direction (2026-10-22): keep the dark navy and amber/gold visual language across Web and
 * Mobile. This is a PROPOSED RECONSTRUCTION pending the approved visual masters; it is not an
 * approved master. Web mirrors these values as CSS custom properties (tests/theme-parity.test.ts).
 *
 * State colours are never the only carrier of meaning: every state also has a glyph and words.
 */
export const NAVY_AMBER = {
  bg: "#071C2C",
  surface: "#102A3B",
  surface2: "#17364A",
  line: "#2B4A5E",
  lineStrong: "#45667C",
  ink: "#F4F4F0",
  ink2: "#B9CCD9",
  ink3: "#A9BFCE",
  accent: "#F4C979",
  accentStrong: "#F7D594",
  onAccent: "#071C2C",
  info: "#7CC4F0",
  positive: "#7FC8A9",
  caution: "#F0B35A",
  avoid: "#FF9A6B",
  danger: "#FF8A8A",
  blocked: "#FF6B6B",
  conflict: "#C3A6F2",
  unknown: "#B8C4CC",
  offline: "#9AA6B2",
  focus: "#7CC4F0",
} as const;
export type NavyAmber = typeof NAVY_AMBER;
