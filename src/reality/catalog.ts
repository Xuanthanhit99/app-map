import type { SafetyLevel } from "../domain/state-model";

/**
 * Domain catalog shared by API, web and mobile.
 * Freshness windows and report lifetimes are explicit policy, not inferred.
 * FRESH: age <= freshMs; AGING: <= agingMs; otherwise STALE (still shown as "từng ghi nhận" until validUntil).
 */
export type RealityDomain = "ROAD" | "WEATHER" | "PARKING" | "PLACE_OPEN" | "CROWD" | "QUEUE" | "PRICE" | "ACTIVITY" | "VEHICLE";

export type DomainPolicy = {
  label: string;
  values: Record<string, { label: string; safety: SafetyLevel }>;
  freshMs: number;
  agingMs: number;
  /** Lifetime of a community report before it stops contributing. */
  reportTtlMs: number;
  /** Corroboration radius for community reports with no place. */
  clusterRadiusM: number;
  /** Whether a member of the public may report this domain. */
  reportable: boolean;
  /** Whether the domain is about a place (requires placeId) rather than a point on the road. */
  placeBound: boolean;
};

const min = 60_000;
const hour = 60 * min;

export const DOMAIN_CATALOG: Record<RealityDomain, DomainPolicy> = {
  ROAD: {
    label: "Tình trạng đường",
    values: {
      CLEAR: { label: "Đường thông thoáng", safety: "NONE" },
      SLOW: { label: "Di chuyển chậm", safety: "NONE" },
      CONGESTED: { label: "Ùn tắc", safety: "NONE" },
      ACCIDENT: { label: "Có tai nạn", safety: "CAUTION" },
      FLOODED_LIGHT: { label: "Ngập nhẹ", safety: "CAUTION" },
      FLOODED_MODERATE: { label: "Ngập vừa", safety: "AVOID" },
      FLOODED_DEEP: { label: "Ngập sâu", safety: "BLOCKED" },
      BLOCKED: { label: "Đường bị chặn", safety: "BLOCKED" },
    },
    freshMs: 15 * min, agingMs: 45 * min, reportTtlMs: 90 * min, clusterRadiusM: 150, reportable: true, placeBound: false,
  },
  WEATHER: {
    label: "Thời tiết",
    values: {
      CLEAR: { label: "Trời quang", safety: "NONE" },
      CLOUDY: { label: "Nhiều mây", safety: "NONE" },
      FOG: { label: "Sương mù", safety: "CAUTION" },
      DRIZZLE: { label: "Mưa phùn", safety: "NONE" },
      RAIN_LIGHT: { label: "Mưa nhẹ", safety: "NONE" },
      RAIN_HEAVY: { label: "Mưa to", safety: "CAUTION" },
      THUNDERSTORM: { label: "Dông", safety: "AVOID" },
    },
    freshMs: 60 * min, agingMs: 3 * hour, reportTtlMs: 60 * min, clusterRadiusM: 1500, reportable: true, placeBound: false,
  },
  PARKING: {
    label: "Bãi xe",
    values: {
      AVAILABLE: { label: "Còn chỗ", safety: "NONE" },
      LIMITED: { label: "Còn ít chỗ", safety: "NONE" },
      FULL: { label: "Bãi đầy", safety: "NONE" },
      CLOSED: { label: "Bãi đang đóng cửa", safety: "NONE" },
      RESTRICTED: { label: "Bãi có hạn chế", safety: "NONE" },
    },
    freshMs: 15 * min, agingMs: 45 * min, reportTtlMs: 60 * min, clusterRadiusM: 80, reportable: true, placeBound: true,
  },
  PLACE_OPEN: {
    label: "Mở cửa",
    values: {
      OPEN: { label: "Đang mở cửa", safety: "NONE" },
      CLOSED: { label: "Đang đóng cửa", safety: "NONE" },
      TEMPORARILY_CLOSED: { label: "Tạm đóng cửa", safety: "NONE" },
    },
    freshMs: 2 * hour, agingMs: 12 * hour, reportTtlMs: 12 * hour, clusterRadiusM: 80, reportable: true, placeBound: true,
  },
  CROWD: {
    label: "Mức đông",
    values: {
      QUIET: { label: "Khá vắng", safety: "NONE" },
      NORMAL: { label: "Bình thường", safety: "NONE" },
      BUSY: { label: "Đông", safety: "NONE" },
      VERY_BUSY: { label: "Rất đông", safety: "NONE" },
    },
    freshMs: 20 * min, agingMs: 60 * min, reportTtlMs: 60 * min, clusterRadiusM: 80, reportable: true, placeBound: true,
  },
  QUEUE: {
    label: "Hàng chờ",
    values: {
      NONE: { label: "Không phải chờ", safety: "NONE" },
      SHORT: { label: "Hàng chờ ngắn", safety: "NONE" },
      MODERATE: { label: "Hàng chờ vừa", safety: "NONE" },
      LONG: { label: "Hàng chờ dài", safety: "NONE" },
      VERY_LONG: { label: "Hàng chờ rất dài", safety: "NONE" },
    },
    freshMs: 15 * min, agingMs: 45 * min, reportTtlMs: 60 * min, clusterRadiusM: 80, reportable: true, placeBound: true,
  },
  PRICE: {
    label: "Giá",
    values: {
      LOWER_THAN_USUAL: { label: "Rẻ hơn thường lệ", safety: "NONE" },
      USUAL: { label: "Như thường lệ", safety: "NONE" },
      HIGHER_THAN_USUAL: { label: "Đắt hơn thường lệ", safety: "NONE" },
    },
    freshMs: 24 * hour, agingMs: 7 * 24 * hour, reportTtlMs: 7 * 24 * hour, clusterRadiusM: 80, reportable: false, placeBound: true,
  },
  ACTIVITY: {
    label: "Hoạt động",
    values: {
      EVENT: { label: "Có sự kiện", safety: "NONE" },
      MARKET: { label: "Có chợ / phố đi bộ", safety: "NONE" },
      CONSTRUCTION: { label: "Đang thi công", safety: "CAUTION" },
    },
    freshMs: 2 * hour, agingMs: 6 * hour, reportTtlMs: 6 * hour, clusterRadiusM: 200, reportable: false, placeBound: false,
  },
  VEHICLE: {
    label: "Phương tiện",
    values: {
      BUS_ON_TIME: { label: "Xe buýt đúng giờ", safety: "NONE" },
      BUS_DELAYED: { label: "Xe buýt trễ", safety: "NONE" },
    },
    freshMs: 10 * min, agingMs: 30 * min, reportTtlMs: 30 * min, clusterRadiusM: 200, reportable: false, placeBound: false,
  },
};

export const REALITY_DOMAINS = Object.keys(DOMAIN_CATALOG) as RealityDomain[];

export function isDomainValue(domain: string, value: string): domain is RealityDomain {
  return domain in DOMAIN_CATALOG && value in DOMAIN_CATALOG[domain as RealityDomain].values;
}

export function freshnessFor(domain: RealityDomain, ageMs: number): "FRESH" | "AGING" | "STALE" {
  const p = DOMAIN_CATALOG[domain];
  return ageMs <= p.freshMs ? "FRESH" : ageMs <= p.agingMs ? "AGING" : "STALE";
}

/** Explicit impact thresholds used by Watch Areas and Journey Impact (see docs/product). */
export type ImpactSeverity = "INFO" | "MINOR" | "SIGNIFICANT" | "SAFETY_CRITICAL";
export const SEVERITY_RANK: Record<ImpactSeverity, number> = { INFO: 0, MINOR: 1, SIGNIFICANT: 2, SAFETY_CRITICAL: 3 };

export function severityOf(input: { truth: "KNOWN" | "UNKNOWN" | "CONFLICT"; safety: SafetyLevel; domain: RealityDomain; value: string | null; verifiedIncident?: boolean }): ImpactSeverity {
  if (input.verifiedIncident) return "SAFETY_CRITICAL";
  if (input.truth === "KNOWN") {
    if (input.safety === "BLOCKED") return "SAFETY_CRITICAL";
    if (input.safety === "AVOID") return "SIGNIFICANT";
    if (input.safety === "CAUTION") return "MINOR";
    if (input.domain === "ROAD" && (input.value === "CONGESTED" || input.value === "SLOW")) return "MINOR";
    return "INFO";
  }
  // Uncertain information is surfaced, but never escalated past MINOR on its own.
  if (input.truth === "CONFLICT") return "MINOR";
  return "INFO";
}
