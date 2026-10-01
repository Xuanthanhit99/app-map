import type { ComposableState, Freshness, Provenance, TruthStatus } from "../../domain/state-model";
import type { PlaceFacts, PlaceLiveSummary } from "../../domain/place-states";
import { describeRealityState } from "../../accessibility/semantics";
import { getDetailContainer, type ResponsiveContract } from "../../responsive/layout-contract";

export interface PlaceNowState {
  facts: PlaceFacts;
  live: ComposableState<PlaceLiveSummary>;
}

export interface PlaceNowViewModel {
  place: PlaceFacts;
  headline: string;
  supportingText: string;
  live: PlaceLiveSummary | null;
  truthStatus: TruthStatus;
  freshness?: Freshness;
  evidence: Provenance[];
  container: ReturnType<typeof getDetailContainer>;
  showAskHere: boolean;
  accessibility: ReturnType<typeof describeRealityState>;
}

function headlineFor(state: PlaceNowState): string {
  if (state.live.contentAvailability === "NOT_APPLICABLE") return "Không áp dụng";
  if (state.live.truthStatus === "UNKNOWN") return "Chưa rõ tình trạng hiện tại";
  if (state.live.truthStatus === "CONFLICT") return "Thông tin tại đây đang mâu thuẫn";

  const open = state.live.domain.open;
  if (open === "TEMPORARILY_CLOSED") return "Đang tạm đóng cửa";
  if (open === "CLOSED") return "Đang đóng cửa";
  if (open === "CLOSING_SOON") return "Sắp đóng cửa";

  const crowd = state.live.domain.crowd;
  if (crowd === "VERY_BUSY") return "Hiện đang rất đông";
  if (crowd === "BUSY") return "Hiện đang đông";
  if (crowd === "QUIET") return "Hiện khá vắng";

  return "Tình trạng tại đây";
}

function supportingFor(state: PlaceNowState): string {
  const parts: string[] = [];
  const live = state.live.domain;

  if (state.live.truthStatus === "UNKNOWN") {
    parts.push("Chưa có đủ bằng chứng gần đây để xác nhận.");
  } else if (state.live.truthStatus === "CONFLICT") {
    parts.push("Các nguồn gần đây đang cho tín hiệu khác nhau.");
  } else {
    if (live.queue && live.queue !== "NONE") {
      const queue = {
        SHORT: "Hàng chờ ngắn",
        MODERATE: "Hàng chờ vừa",
        LONG: "Hàng chờ dài",
        VERY_LONG: "Hàng chờ rất dài",
      }[live.queue];
      if (queue) parts.push(queue);
    }
    if (live.availableSeating === "AVAILABLE") parts.push("Có ghi nhận còn chỗ ngồi");
    if (live.availableSeating === "LIMITED") parts.push("Có ghi nhận còn ít chỗ ngồi");
  }

  if (state.live.freshness === "AGING") parts.push("Thông tin đang cũ dần.");
  if (state.live.freshness === "STALE") parts.push("Thông tin có thể đã thay đổi.");
  if (state.live.systemAvailability === "OFFLINE") parts.push("Đang xem dữ liệu đã lưu.");

  return parts.join(" ") || "Xem bằng chứng gần đây để hiểu tình trạng hiện tại.";
}

export function buildPlaceNowViewModel(
  state: PlaceNowState,
  responsive: ResponsiveContract,
): PlaceNowViewModel {
  const headline = headlineFor(state);
  const supportingText = supportingFor(state);

  return {
    place: state.facts,
    headline,
    supportingText,
    live: state.live.truthStatus === "KNOWN" ? state.live.domain : null,
    truthStatus: state.live.truthStatus,
    ...(state.live.freshness !== undefined ? { freshness: state.live.freshness } : {}),
    evidence: state.live.provenance ?? [],
    container: getDetailContainer(responsive),
    showAskHere:
      state.live.truthStatus !== "KNOWN" ||
      state.live.freshness === "STALE",
    accessibility: describeRealityState({
      headline,
      ...(state.live.freshness !== undefined ? { freshness: state.live.freshness } : {}),
      ...(state.live.provenance?.[0]?.sourceType !== undefined ? { provenance: state.live.provenance[0].sourceType } : {}),
      warning:
        state.live.domain.open === "TEMPORARILY_CLOSED" ||
        state.live.domain.open === "CLOSED",
    }),
  };
}
