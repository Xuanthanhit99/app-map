import type { Metadata } from "next";
import Link from "next/link";
import { JourneyPlanner } from "@/components/journey-planner";
import { duration, relativeTime } from "@/lib/format";
import { api, apiOrNull } from "@/lib/server-api";
import { currentUser } from "@/lib/session";
import type { Journey, PlaceDetail } from "@/lib/types";

export const metadata: Metadata = { title: "Hành trình", description: "Lên tuyến đường và xem các tình trạng đã xác minh có thể ảnh hưởng tới hành trình của bạn.", alternates: { canonical: "/hanh-trinh" } };

const STATUS: Record<string, string> = { PLANNED: "Đã lên kế hoạch", ACTIVE: "Đang đi", PAUSED: "Tạm dừng", ARRIVED: "Đã đến", CANCELLED: "Đã hủy", STOPPED: "Đã dừng" };

export default async function JourneyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const dest = sp.to ? await apiOrNull<PlaceDetail>(`/v1/places/${encodeURIComponent(sp.to)}`) : null;
  const from = sp.from?.split(",").map(Number);
  const history = user ? (await api<{ items: Journey[] }>("/v1/journeys", { auth: true }).catch(() => ({ items: [] as Journey[] }))).items : [];
  return (
    <div className="page-narrow stack-lg">
      <header className="stack"><h1>Lên hành trình</h1><p className="lede">Chọn điểm đến. Reality tính tuyến qua nhà cung cấp định tuyến và kiểm tra các tình trạng đã xác minh dọc đường.</p></header>
      <JourneyPlanner signedIn={Boolean(user)}
        initialDestination={dest ? { id: dest.place.id, slug: dest.place.slug, name: dest.place.name, coordinate: dest.place.coordinate } : null}
        initialOrigin={from && from.length === 2 && from.every(Number.isFinite) ? { lat: from[0]!, lng: from[1]! } : null}
        initialMode={sp.mode === "WALKING" || sp.mode === "CYCLING" ? sp.mode : "DRIVING"} />
      {user ? (
        <section aria-labelledby="hist-h" className="stack">
          <h2 id="hist-h">Hành trình gần đây</h2>
          {history.length === 0 ? <p className="small muted">Bạn chưa có hành trình nào.</p> : (
            <ul className="list-plain divided panel panel-tight">{history.slice(0, 10).map((j) => (
              <li key={j.id} style={{ padding: "10px 0" }} className="row"><Link href={`/hanh-trinh/${j.id}`}><strong>{j.destinationLabel ?? "Điểm đến"}</strong></Link><span className="badge">{STATUS[j.status]}</span><span className="small muted">{relativeTime(j.createdAt)}{j.route?.durationSeconds ? ` · ${duration(j.route.durationSeconds)}` : ""}</span></li>
            ))}</ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
