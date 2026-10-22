"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

type Run = { id: string; source_id: string; status: string; started_at: string; finished_at: string | null; records_in: number; records_upserted: number; records_rejected: number; error_code: string | null; attempt: number; scope: { regionId?: string } };
export default function Runs() {
  const { data, error, loading, reload } = useApi<{ items: Run[] }>("/v1/admin/ingestion/runs?limit=100");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function trigger(job: "places" | "weather" | "maintenance") {
    setBusy(job); setMsg(null);
    try { await call("/v1/admin/ingestion/run", { method: "POST", body: { job } }); setMsg("Đã chạy xong. Xem kết quả bên dưới."); await reload(); }
    catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); } finally { setBusy(null); }
  }
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Lượt nạp dữ liệu</h1>
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => void trigger("weather")}>{busy === "weather" ? "Đang chạy…" : "Nạp thời tiết"}</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => void trigger("places")}>{busy === "places" ? "Đang chạy…" : "Nạp địa điểm OSM"}</button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={Boolean(busy)} onClick={() => void trigger("maintenance")}>Bảo trì (hết hạn, lưu giữ)</button>
      </div>
      <p className="xsmall muted">Chỉ quản trị viên chạy được. Mỗi phạm vi chỉ nạp một lần trong cửa sổ (địa điểm: 24 giờ, thời tiết: 15 phút).</p>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? <div className="empty"><h3>Chưa có lượt nạp nào</h3><p>Worker chưa chạy hoặc INGESTION_ENABLED đang tắt.</p></div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Nguồn</th><th>Trạng thái</th><th>Bắt đầu</th><th>Bản ghi</th><th>Lỗi</th></tr></thead><tbody>
          {data.items.map((r) => <tr key={r.id}><td>{r.source_id}<div className="xsmall muted">{r.scope.regionId}</div></td><td><span className="badge" data-tone={r.status === "SUCCEEDED" ? "ok" : r.status === "FAILED" ? "bad" : ""}>{r.status}</span></td><td>{dateTime(r.started_at)}</td><td>{r.records_upserted}/{r.records_in} (loại {r.records_rejected})</td><td>{r.error_code ? `${r.error_code} · lần ${r.attempt}` : "—"}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
