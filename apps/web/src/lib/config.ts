export const API_URL = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
export const ACCESS_COOKIE = "rt_a";
export const REFRESH_COOKIE = "rt_r";
/** Default coverage region (must match the API's COVERAGE_REGIONS). */
export const DEFAULT_AREA = { id: "ha-noi", name: "Hà Nội", bbox: [105.78, 20.98, 105.88, 21.08] as [number, number, number, number], center: [105.8524, 21.0287] as [number, number] };
