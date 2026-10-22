import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dateTime } from "@/lib/format";
import { apiOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Hành trình được chia sẻ", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Shared = { status: string; destinationLabel: string | null; estimatedArrival: string | null; etaLabel: string; expiresAt: string };
const STATUS: Record<string, string> = { PLANNED: "Chưa xuất phát", ACTIVE: "Đang trên đường", PAUSED: "Tạm dừng", ARRIVED: "Đã đến nơi", CANCELLED: "Đã hủy", STOPPED: "Đã kết thúc" };

export default async function SharedJourney({ params }: { params: Promise<{ token: string }> }) {
  const r = await apiOrNull<Shared>(`/v1/shared-journeys/${encodeURIComponent((await params).token)}`, { revalidate: false });
  if (!r) notFound();
  return (
    <div className="auth-card stack">
      <h1 style={{ fontSize: "var(--t-2xl)" }}>{STATUS[r.status] ?? r.status}</h1>
      <p>Đến: <strong>{r.destinationLabel ?? "điểm đến"}</strong></p>
      <p>{r.estimatedArrival ? <>Dự kiến tới khoảng <strong>{dateTime(r.estimatedArrival)}</strong></> : "Chưa có giờ đến dự kiến."}</p>
      <p className="xsmall muted">{r.etaLabel}. Trang này không hiển thị vị trí của người chia sẻ. Liên kết hết hạn lúc {dateTime(r.expiresAt)} và có thể bị thu hồi bất cứ lúc nào.</p>
    </div>
  );
}
