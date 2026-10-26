import type { Provenance } from "../domain/state-model";

const sourceLabels: Record<string, string> = {
  COMMUNITY: "Người dùng gần đây",
  FACILITY_API: "Dữ liệu từ địa điểm",
  OFFICIAL: "Nguồn chính thức",
  SENSOR: "Cảm biến",
  RADAR: "Radar",
  SATELLITE: "Vệ tinh",
  BUSINESS: "Đơn vị vận hành",
};

const confidenceLabels: Record<NonNullable<Provenance["confidence"]>, string> = {
  LOW: "Độ chắc chắn thấp",
  MEDIUM: "Độ chắc chắn vừa",
  HIGH: "Độ chắc chắn cao",
};

export function describeProvenance(item: Provenance): string {
  const source = sourceLabels[item.sourceType] ?? "Nguồn quan sát";
  const confidence = item.confidence ? confidenceLabels[item.confidence] : "Chưa rõ độ chắc chắn";
  return `${source} · ${confidence}`;
}
