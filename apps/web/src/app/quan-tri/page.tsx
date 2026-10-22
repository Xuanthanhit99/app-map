import { api } from "@/lib/server-api";
import { dateTime } from "@/lib/format";

type Dash = { generatedAt: string; counts: Record<string, number>; alerts: { severity: string; code: string; message: string }[] };
const LABELS: Record<string, string> = { users: "Người dùng", users_7d: "Người dùng mới (7 ngày)", places: "Địa điểm", active_reports: "Báo cáo hiện hành", held_reports: "Báo cáo bị giữ", disputed_reports: "Báo cáo mâu thuẫn", stories_pending: "Câu chuyện chờ duyệt", open_incidents: "Sự cố đang mở", active_journeys: "Hành trình đang đi", active_observations: "Quan sát còn hiệu lực" };

export default async function AdminHome() {
  const d = await api<Dash>("/v1/admin/dashboard", { auth: true });
  return (
    <>
      <header className="stack"><h1 style={{ fontSize: "var(--t-2xl)" }}>Tổng quan vận hành</h1><p className="small muted">Cập nhật {dateTime(d.generatedAt)}</p></header>
      <section aria-labelledby="al" className="stack"><h2 id="al">Cảnh báo vận hành</h2>
        {d.alerts.length === 0 ? <div className="notice notice-ok">Không có cảnh báo nào.</div> : <ul className="list-plain stack">{d.alerts.map((a) => <li key={a.code + a.message} className={`notice ${a.severity === "CRITICAL" ? "notice-error" : "notice-warn"}`}><strong>{a.severity === "CRITICAL" ? "Nghiêm trọng" : "Cần chú ý"}:</strong> {a.message}</li>)}</ul>}
      </section>
      <section aria-labelledby="kp" className="stack"><h2 id="kp">Số liệu</h2>
        <div className="kpis">{Object.entries(d.counts).map(([k, v]) => <div key={k} className="kpi"><div className="v">{v}</div><div className="k">{LABELS[k] ?? k}</div></div>)}</div>
      </section>
    </>
  );
}
