"use client";
import { call } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

type I = { id: string; title: string; severity: string; status: string; radius_m: number; report_ids: string[]; created_at: string; coordinate: [number, number] | null };
export default function Incidents() {
  const { data, error, loading, reload } = useApi<{ items: I[] }>("/v1/admin/incidents");
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Sự cố</h1>
      <p className="small muted">Sự cố chỉ được tạo từ báo cáo đã xác minh (API kiểm tra). Tạo từ hàng đợi báo cáo sau khi xác minh; sự cố đang mở sẽ hiện trên mọi hành trình đi qua.</p>
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? <div className="empty"><h3>Không có sự cố</h3><p>Chưa có sự cố nào được ghi nhận.</p></div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Sự cố</th><th>Mức</th><th>Trạng thái</th><th>Tạo lúc</th><th /></tr></thead><tbody>
          {data.items.map((i) => <tr key={i.id}><td><strong>{i.title}</strong><div className="xsmall muted">{i.report_ids.length} báo cáo · bán kính {i.radius_m} m</div></td><td>{i.severity}</td><td><span className="badge" data-tone={i.status === "RESOLVED" ? "ok" : "bad"}>{i.status}</span></td><td>{dateTime(i.created_at)}</td>
            <td><div className="row">{i.status !== "RESOLVED" ? <><button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await call(`/v1/admin/incidents/${i.id}`, { method: "PATCH", body: { status: "MONITORING" } }); await reload(); }}>Theo dõi</button><button type="button" className="btn btn-primary btn-sm" onClick={async () => { await call(`/v1/admin/incidents/${i.id}`, { method: "PATCH", body: { status: "RESOLVED" } }); await reload(); }}>Đã xử lý</button></> : null}</div></td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
