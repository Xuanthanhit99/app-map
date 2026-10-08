export const TRUTH = Object.freeze(["KNOWN", "UNKNOWN", "CONFLICT"]);
export const FRESHNESS = Object.freeze(["FRESH", "AGING", "STALE"]);

export function resolveEvidence(input, now = Date.now()) {
  if (!input || typeof input !== "object") return { truth: "UNKNOWN", freshness: null, label: "Chưa có dữ liệu", safeToAssert: false };
  const truth = TRUTH.includes(input.truth) ? input.truth : "UNKNOWN";
  const observedAt = typeof input.observedAt === "string" ? Date.parse(input.observedAt) : NaN;
  const validTime = Number.isFinite(observedAt) && observedAt <= now;
  const age = validTime ? now - observedAt : null;
  const freshness = age === null ? null : age <= 5 * 60_000 ? "FRESH" : age <= 30 * 60_000 ? "AGING" : "STALE";
  if (truth === "UNKNOWN") return { truth, freshness, label: "Chưa xác minh", safeToAssert: false };
  if (truth === "CONFLICT") return { truth, freshness, label: "Thông tin mâu thuẫn", safeToAssert: false };
  if (!input.source || !validTime) return { truth: "UNKNOWN", freshness: null, label: "Thiếu nguồn hoặc thời gian", safeToAssert: false };
  return { truth, freshness, label: freshness === "STALE" ? "Dữ liệu đã cũ" : freshness === "AGING" ? "Cần xác minh lại" : "Đã xác minh", safeToAssert: freshness === "FRESH" };
}

export function resolveCollection(value) {
  if (!value || value.status === "loading") return { status: "loading", items: [] };
  if (value.status === "error") return { status: "error", items: [] };
  if (!Array.isArray(value.items) || value.items.length === 0) return { status: "empty", items: [] };
  return { status: "ready", items: value.items };
}
