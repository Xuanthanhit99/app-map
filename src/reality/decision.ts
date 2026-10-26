import { CATEGORY_BY_ID, foldText, PLACE_CATEGORIES } from "./categories";

/**
 * Flow 06 — "Đi đâu bây giờ?" deterministic decision core (pure, testable).
 * Every factor that changes a score is returned with its evidence or labelled as an assumption.
 * Nothing here invents conditions: missing state is reported as UNKNOWN, never as favourable.
 */
export const DECISION_POLICY_VERSION = "2026-10-22.1";

export type IntentModifiers = { quiet: boolean; outdoor: boolean; indoor: boolean; kids: boolean; wheelchair: boolean; cheap: boolean };
export type ParsedIntent = { categories: string[]; modifiers: IntentModifiers; matchedKeywords: string[] };

const MODIFIER_KEYWORDS: Record<keyof IntentModifiers, string[]> = {
  quiet: ["yen tinh", "vang", "it nguoi", "quiet", "tap trung"],
  outdoor: ["ngoai troi", "thoang", "outdoor", "di dao", "hit tho"],
  indoor: ["trong nha", "tranh mua", "dieu hoa", "mat me", "indoor"],
  kids: ["tre em", "con nho", "be", "gia dinh", "kids"],
  wheelchair: ["xe lan", "tiep can", "wheelchair", "khong bac thang"],
  cheap: ["re", "binh dan", "tiet kiem", "cheap"],
};

export function parseIntent(intent: string, explicitCategories: string[] = []): ParsedIntent {
  const text = ` ${foldText(intent).replace(/[^a-z0-9 ]/g, " ")} `;
  const matched: string[] = [];
  const categories = new Set(explicitCategories.filter((c) => CATEGORY_BY_ID.has(c)));
  for (const c of PLACE_CATEGORIES) {
    for (const k of c.keywords) {
      if (text.includes(` ${k} `)) { categories.add(c.id); matched.push(k); }
    }
  }
  const modifiers = Object.fromEntries(Object.entries(MODIFIER_KEYWORDS).map(([m, ks]) => {
    const hit = ks.filter((k) => text.includes(` ${k} `));
    matched.push(...hit);
    return [m, hit.length > 0];
  })) as IntentModifiers;
  if (modifiers.kids) categories.add("playground");
  return { categories: [...categories], modifiers, matchedKeywords: [...new Set(matched)] };
}

export type StateSummary = { truth: "KNOWN" | "UNKNOWN" | "CONFLICT"; value: string | null; freshness: "FRESH" | "AGING" | "STALE" | null; safety: string; sourceIds: string[]; observedAt: string | null; nature: string | null };

export type Candidate = {
  placeId: string; name: string; category: string; distanceMeters: number | null; wheelchair: string | null;
  openingHoursPublished: boolean;
  states: Partial<Record<"PLACE_OPEN" | "CROWD" | "QUEUE" | "PARKING", StateSummary>>;
  weather: StateSummary | null;
  /** Worst KNOWN road state within 300 m (if any). */
  nearbyHazard: (StateSummary & { distanceMeters: number }) | null;
};

export type FactorEvidence = { sourceIds: string[]; observedAt: string | null; truth: string; freshness: string | null; nature: string | null };
export type Factor = {
  factor: "DISTANCE" | "TIME_FIT" | "OPEN_STATUS" | "CROWD" | "QUEUE" | "WEATHER" | "HAZARD" | "ACCESSIBILITY" | "PREFERENCE" | "CATEGORY";
  effect: number;
  text: string;
  basis: "EVIDENCE" | "ASSUMPTION" | "USER_INPUT" | "UNKNOWN";
  evidence?: FactorEvidence;
};

export type DecisionInput = {
  intent: ParsedIntent;
  availableMinutes: number | null;
  mode: "DRIVING" | "WALKING" | "CYCLING" | "MOTORBIKE";
  radiusMeters: number;
  preferredCategories: string[];
};

export type ScoredOption = {
  placeId: string; score: number; excluded: boolean; exclusionReason: string | null;
  factors: Factor[]; risks: string[]; unknowns: string[];
  estimate: { travelMinutes: number; method: "STRAIGHT_LINE_X1_35_AVG_SPEED"; label: string; visitMinutesAssumed: number } | null;
};

/** Average door-to-door speeds used only for labelled estimates (km/h). */
export const ESTIMATE_SPEEDS_KMH = { WALKING: 4.5, CYCLING: 12, MOTORBIKE: 22, DRIVING: 18 } as const;

const ev = (s: StateSummary): FactorEvidence => ({ sourceIds: s.sourceIds, observedAt: s.observedAt, truth: s.truth, freshness: s.freshness, nature: s.nature });

export function scoreCandidate(c: Candidate, input: DecisionInput): ScoredOption {
  const factors: Factor[] = [];
  const risks: string[] = [];
  const unknowns: string[] = [];
  let excluded: string | null = null;
  const category = CATEGORY_BY_ID.get(c.category);

  factors.push({ factor: "CATEGORY", effect: 20, text: `Phù hợp ý định: ${category?.label ?? c.category}`, basis: "USER_INPUT" });

  let estimate: ScoredOption["estimate"] = null;
  if (c.distanceMeters !== null) {
    const closeness = Math.max(0, 1 - c.distanceMeters / input.radiusMeters);
    factors.push({ factor: "DISTANCE", effect: Math.round(30 * closeness), text: `Cách khoảng ${formatDistance(c.distanceMeters)} (đường chim bay)`, basis: "EVIDENCE",
      evidence: { sourceIds: ["user-location", "osm-overpass"], observedAt: null, truth: "KNOWN", freshness: null, nature: "STATIC_REFERENCE" } });
    const travelMinutes = Math.max(1, Math.round((c.distanceMeters * 1.35 / 1000) / ESTIMATE_SPEEDS_KMH[input.mode] * 60));
    const visit = category?.typicalVisitMinutes ?? 45;
    estimate = { travelMinutes, method: "STRAIGHT_LINE_X1_35_AVG_SPEED", label: "Ước tính, không phải thời gian dẫn đường", visitMinutesAssumed: visit };
    if (input.availableMinutes !== null) {
      const needed = travelMinutes * 2 + visit;
      if (travelMinutes * 2 >= input.availableMinutes) excluded = "Không đủ thời gian cho đường đi và về (ước tính)";
      else if (needed <= input.availableMinutes) factors.push({ factor: "TIME_FIT", effect: 10, text: `Vừa với ${input.availableMinutes} phút bạn có (ước tính)`, basis: "ASSUMPTION" });
      else unknowns.push(`Thời gian ở lại có thể ngắn hơn thường lệ (khoảng ${input.availableMinutes - travelMinutes * 2} phút, ước tính)`);
    }
  } else {
    unknowns.push("Khoảng cách: chưa có vị trí xuất phát");
  }

  const open = c.states.PLACE_OPEN;
  if (open?.truth === "KNOWN" && (open.value === "CLOSED" || open.value === "TEMPORARILY_CLOSED")) {
    excluded = open.value === "CLOSED" ? "Đang đóng cửa (đã xác nhận)" : "Tạm đóng cửa (đã xác nhận)";
    factors.push({ factor: "OPEN_STATUS", effect: -100, text: excluded, basis: "EVIDENCE", evidence: ev(open) });
  } else if (open?.truth === "KNOWN" && open.value === "OPEN") {
    factors.push({ factor: "OPEN_STATUS", effect: open.freshness === "FRESH" ? 15 : 8, text: open.freshness === "FRESH" ? "Đang mở cửa (mới xác nhận)" : "Từng xác nhận đang mở cửa", basis: "EVIDENCE", evidence: ev(open) });
  } else if (open?.truth === "CONFLICT") {
    risks.push("Thông tin mở cửa đang mâu thuẫn");
    factors.push({ factor: "OPEN_STATUS", effect: -5, text: "Trạng thái mở cửa đang mâu thuẫn", basis: "EVIDENCE", evidence: ev(open) });
  } else {
    unknowns.push(c.openingHoursPublished ? "Mở cửa: chỉ có lịch công bố, chưa có xác nhận hiện tại" : "Mở cửa: chưa rõ");
  }

  const crowd = c.states.CROWD;
  if (crowd?.truth === "KNOWN") {
    const busy = crowd.value === "BUSY" || crowd.value === "VERY_BUSY";
    const effect = input.intent.modifiers.quiet ? (busy ? -20 : crowd.value === "QUIET" ? 15 : 0) : (crowd.value === "VERY_BUSY" ? -8 : 0);
    if (effect) factors.push({ factor: "CROWD", effect, text: busy ? "Hiện đang đông" : "Hiện khá vắng", basis: "EVIDENCE", evidence: ev(crowd) });
  } else if (input.intent.modifiers.quiet) unknowns.push("Mức đông: chưa rõ");

  const queue = c.states.QUEUE;
  if (queue?.truth === "KNOWN" && (queue.value === "LONG" || queue.value === "VERY_LONG")) {
    factors.push({ factor: "QUEUE", effect: -10, text: "Hàng chờ dài", basis: "EVIDENCE", evidence: ev(queue) });
  }

  const w = c.weather;
  const outdoor = category ? !category.indoor : false;
  if (w?.truth === "KNOWN") {
    const wet = w.value === "RAIN_HEAVY" || w.value === "THUNDERSTORM" || w.value === "RAIN_LIGHT";
    const severe = w.value === "RAIN_HEAVY" || w.value === "THUNDERSTORM";
    if (wet && outdoor) {
      factors.push({ factor: "WEATHER", effect: severe ? -30 : -10, text: `Dự báo ${w.value === "THUNDERSTORM" ? "có dông" : severe ? "mưa to" : "mưa"} — địa điểm ngoài trời`, basis: "EVIDENCE", evidence: ev(w) });
      if (severe) risks.push("Thời tiết bất lợi cho hoạt động ngoài trời (dự báo)");
    } else if (wet && !outdoor && (input.intent.modifiers.indoor || severe)) {
      factors.push({ factor: "WEATHER", effect: 8, text: "Trong nhà, phù hợp khi trời mưa (dự báo)", basis: "EVIDENCE", evidence: ev(w) });
    } else if (!wet && outdoor && input.intent.modifiers.outdoor) {
      factors.push({ factor: "WEATHER", effect: 6, text: "Không có dự báo mưa", basis: "EVIDENCE", evidence: ev(w) });
    }
  } else if (outdoor) unknowns.push("Thời tiết: chưa có dữ liệu");

  if (input.intent.modifiers.indoor && outdoor) factors.push({ factor: "CATEGORY", effect: -15, text: "Bạn muốn ở trong nhà", basis: "USER_INPUT" });
  if (input.intent.modifiers.outdoor && !outdoor) factors.push({ factor: "CATEGORY", effect: -10, text: "Bạn muốn ngoài trời", basis: "USER_INPUT" });

  const h = c.nearbyHazard;
  if (h && h.truth === "KNOWN" && h.safety !== "NONE") {
    const effect = h.safety === "BLOCKED" ? -35 : h.safety === "AVOID" ? -20 : -8;
    factors.push({ factor: "HAZARD", effect, text: `Gần đó (${formatDistance(h.distanceMeters)}) có tình trạng đường bất lợi đã xác nhận`, basis: "EVIDENCE", evidence: ev(h) });
    risks.push("Có tình trạng đường bất lợi gần điểm đến");
  }

  if (input.intent.modifiers.wheelchair) {
    if (c.wheelchair === "no") excluded = "Không tiếp cận được bằng xe lăn (theo OpenStreetMap)";
    else if (c.wheelchair === "yes" || c.wheelchair === "limited") factors.push({ factor: "ACCESSIBILITY", effect: c.wheelchair === "yes" ? 10 : 3, text: c.wheelchair === "yes" ? "Tiếp cận được bằng xe lăn" : "Tiếp cận xe lăn hạn chế", basis: "EVIDENCE", evidence: { sourceIds: ["osm-overpass"], observedAt: null, truth: "KNOWN", freshness: null, nature: "STATIC_REFERENCE" } });
    else unknowns.push("Khả năng tiếp cận xe lăn: chưa rõ");
  }

  if (input.preferredCategories.includes(c.category)) factors.push({ factor: "PREFERENCE", effect: 5, text: "Thuộc loại địa điểm bạn ưu tiên", basis: "USER_INPUT" });

  const score = excluded ? -1 : factors.reduce((s, f) => s + f.effect, 0);
  return { placeId: c.placeId, score, excluded: Boolean(excluded), exclusionReason: excluded, factors, risks, unknowns, estimate };
}

export function rankCandidates(candidates: Candidate[], input: DecisionInput) {
  const scored = candidates.map((c) => ({ c, s: scoreCandidate(c, input) }));
  const included = scored.filter((x) => !x.s.excluded)
    .sort((a, b) => b.s.score - a.s.score || (a.c.distanceMeters ?? Infinity) - (b.c.distanceMeters ?? Infinity) || a.c.placeId.localeCompare(b.c.placeId));
  const excluded = scored.filter((x) => x.s.excluded);
  return { included, excluded };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
