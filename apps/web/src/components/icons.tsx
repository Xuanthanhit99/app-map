import type { SVGProps } from "react";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
export const IconCompass = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" /></svg>;
export const IconMap = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" /><path d="M9 4v14M15 6v14" /></svg>;
export const IconDecide = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 21V11" /><path d="M12 11 6 5M12 11l6-6" /><path d="M4 5h4M16 5h4" /></svg>;
export const IconRoute = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></svg>;
export const IconUser = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></svg>;
export const IconBell = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
export const IconLocate = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
export const IconInfo = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
export const IconAlert = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4M12 17h.01" /></svg>;
export const IconPlus = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IconStory = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h6M14 4v4h4" /></svg>;

/** Wordmark glyph: three nested contour lines around a point — a place and the layers of what is known about it. */
export function Glyph(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <path d="M16 3.5c6.5 0 12.5 4.6 12.5 11.6 0 7.6-6.4 13.4-12.9 13.4C9 28.5 3.5 23.2 3.5 16.2 3.5 9 9.4 3.5 16 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
      <path d="M16.2 8.4c4.2 0 7.6 3 7.6 7.3 0 4.6-3.6 7.6-7.9 7.6-4.4 0-7.7-3.1-7.7-7.4 0-4.2 3.5-7.5 8-7.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".75" />
      <circle cx="16" cy="15.8" r="3.1" fill="currentColor" />
    </svg>
  );
}
