import type { ComposableState } from "../domain/state-model";
import type { ParkingAvailability, RoadState } from "../domain/domain-states";
import { resolvePresentation, type Presentation } from "./presentation-resolver";

const roadLabels: Record<RoadState, string> = {
  CLEAR: "Đường thông thoáng",
  SLOW: "Di chuyển chậm",
  FLOODED_LIGHT: "Ngập nhẹ",
  FLOODED_MODERATE: "Ngập vừa",
  FLOODED_DEEP: "Ngập sâu",
  BLOCKED: "Đường bị chặn",
};

const parkingLabels: Record<ParkingAvailability, string> = {
  AVAILABLE: "Còn chỗ",
  LIMITED: "Còn ít chỗ",
  FULL: "Bãi đầy",
  UNKNOWN: "Chưa rõ chỗ trống",
  CLOSED: "Bãi đang đóng cửa",
  RESTRICTED: "Bãi có hạn chế",
};

export function resolveRoadPresentation(
  state: ComposableState<RoadState>,
): Presentation {
  return resolvePresentation(state, {
    domainLabel: "Tình trạng đường",
    knownHeadline: roadLabels[state.domain],
    askCta: "Hỏi tại đây",
    retryCta: "Thử lại",
    fallbackCta: "Tiếp tục với dữ liệu đã lưu",
    permissionCta: "Cấp quyền vị trí",
    stalePrefix: "Từng ghi nhận",
  });
}

export function resolveParkingPresentation(
  state: ComposableState<ParkingAvailability>,
): Presentation {
  return resolvePresentation(state, {
    domainLabel: "Tình trạng bãi xe",
    knownHeadline: parkingLabels[state.domain],
    unknownHeadline: "Chưa rõ tình trạng bãi xe",
    askCta: "Hỏi tại đây",
    retryCta: "Thử lại",
    fallbackCta: "Xem bãi xe khác",
    permissionCta: "Cấp quyền vị trí",
    stalePrefix: "Từng ghi nhận",
  });
}
