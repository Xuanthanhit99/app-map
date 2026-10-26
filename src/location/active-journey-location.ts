import type { LocationLifecycle } from "./location-lifecycle";

export function activeJourneyLocationNotice(location: LocationLifecycle): string | undefined {
  if (location.status === "DENIED") {
    return "Chưa có quyền vị trí. Chỉ dẫn và cảnh báo hành trình vẫn tiếp tục.";
  }
  if (location.status === "UNAVAILABLE") {
    return "Tạm thời chưa xác định được vị trí. Chỉ dẫn và cảnh báo hành trình vẫn tiếp tục.";
  }
  if (location.status === "DEGRADED") {
    return "Vị trí hiện tại đang tạm thời kém tin cậy. Bản đồ chỉ giữ vị trí gần nhất; chưa yêu cầu tuyến đường mới cho đến khi có vị trí mới.";
  }
  return undefined;
}
