export type WidthClass = "SMALL_PHONE" | "LARGE_PHONE" | "TABLET";
export type Orientation = "PORTRAIT" | "LANDSCAPE";

export interface ResponsiveContract {
  widthClass: WidthClass;
  orientation: Orientation;
  dynamicTypeScale: number;
}

export type DetailContainer =
  | "BOTTOM_SHEET"
  | "FLOATING_PANEL"
  | "SIDE_INSPECTOR"
  | "GLANCE_RAIL";

export function getDetailContainer(input: ResponsiveContract): DetailContainer {
  if (input.widthClass === "TABLET") return "SIDE_INSPECTOR";
  if (input.orientation === "LANDSCAPE") return "GLANCE_RAIL";
  if (input.widthClass === "LARGE_PHONE") return "FLOATING_PANEL";
  return "BOTTOM_SHEET";
}

export function shouldReduceChrome(input: ResponsiveContract): boolean {
  return input.widthClass === "SMALL_PHONE" || input.dynamicTypeScale >= 1.6;
}

export function isHighDynamicType(input: ResponsiveContract): boolean {
  return input.dynamicTypeScale >= 2;
}
