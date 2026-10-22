import type { RealityState } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { DOMAIN_CATALOG, type RealityDomain } from "@core/reality/catalog";

export function valueLabel(domain: string, value: string | null | undefined): string {
  if (!value) return "";
  return DOMAIN_CATALOG[domain as RealityDomain]?.values[value]?.label ?? value;
}

const TRUTH_GLYPH = { KNOWN: "✓", UNKNOWN: "?", CONFLICT: "≠" } as const;
const FRESH_LABEL = { FRESH: "Mới cập nhật", AGING: "Đang cũ dần", STALE: "Có thể đã thay đổi" } as const;
const NATURE_LABEL: Record<string, string> = {
  FORECAST: "Dự báo", MODEL_ESTIMATE: "Ước tính", COMMUNITY_REPORT: "Cộng đồng đối chứng", LIVE_OBSERVATION: "Quan sát trực tiếp", STATIC_REFERENCE: "Dữ liệu tham chiếu",
};
const DOMAIN_LABEL: Record<string, string> = { ROAD: "Tình trạng đường", WEATHER: "Thời tiết", PARKING: "Bãi xe", PLACE_OPEN: "Mở cửa", CROWD: "Mức đông", QUEUE: "Hàng chờ", PRICE: "Giá", ACTIVITY: "Hoạt động", VEHICLE: "Phương tiện" };
export const domainLabel = (d: string) => DOMAIN_LABEL[d] ?? d;

/** Headline for any state: never implies "safe/clear" when the truth is not KNOWN. */
export function stateHeadline(s: Pick<RealityState, "truth" | "label" | "domain" | "freshness">): string {
  if (s.truth === "UNKNOWN") return "Chưa rõ";
  if (s.truth === "CONFLICT") return "Thông tin mâu thuẫn";
  if (s.freshness === "STALE") return `Từng ghi nhận: ${(s.label ?? "").toLowerCase()}`;
  return s.label ?? "Đã xác nhận";
}

export function StateChip({ state }: { state: Pick<RealityState, "truth" | "safety" | "label" | "domain" | "freshness"> }) {
  return (
    <span className="state" data-truth={state.truth} data-safety={state.truth === "KNOWN" ? state.safety : "NONE"}>
      <span className="glyph" aria-hidden><span>{TRUTH_GLYPH[state.truth]}</span></span>
      <span className="text">{stateHeadline(state)}</span>
    </span>
  );
}

export function Freshness({ value, observedAt }: { value: RealityState["freshness"]; observedAt: string | null }) {
  if (!value) return null;
  return <span className="fresh" data-f={value}><span className="ring" aria-hidden />{FRESH_LABEL[value]} · {relativeTime(observedAt)}</span>;
}

export function StateCard({ state, showDomain = true }: { state: RealityState; showDomain?: boolean }) {
  const unverified = state.signals[0];
  return (
    <article className="state-card" data-truth={state.truth} data-safety={state.truth === "KNOWN" ? state.safety : "NONE"} aria-label={`${domainLabel(state.domain)}: ${stateHeadline(state)}`}>
      {showDomain ? <span className="domain">{domainLabel(state.domain)}</span> : null}
      <div className="row"><StateChip state={state} />{state.nature ? <span className="nature-tag">{NATURE_LABEL[state.nature] ?? state.nature}</span> : null}</div>
      {state.truth === "UNKNOWN" ? <p className="small muted">Chưa có đủ bằng chứng gần đây. Chưa rõ không có nghĩa là bình thường hay an toàn.</p> : null}
      {state.truth === "CONFLICT" ? <p className="small muted">Các nguồn gần đây cho tín hiệu khác nhau. Hãy kiểm tra tại chỗ trước khi quyết định.</p> : null}
      {unverified ? <p className="signal">Có {unverified.contributors} báo cáo chưa xác minh: “{valueLabel(state.domain, unverified.value)}” · {relativeTime(unverified.latestAt)}</p> : null}
      <div className="evidence">
        <Freshness value={state.freshness} observedAt={state.observedAt} />
        {state.truth !== "UNKNOWN" ? <span>Độ tin cậy {Math.round(state.confidence * 100)}%</span> : null}
        {state.sources.length ? <span>Nguồn: {state.sources.map((s) => s.name).join(", ")}</span> : null}
      </div>
    </article>
  );
}
