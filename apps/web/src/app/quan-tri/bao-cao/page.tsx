"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import type { PublicReport } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { domainLabel } from "@/components/state";

type Row = PublicReport & { reporter: { id: string; displayName: string; trustScore: number } | null; clusterId: string };
const FILTERS = [["held=true", "Bị giữ"], ["status=PENDING", "Chưa xác minh"], ["status=DISPUTED", "Mâu thuẫn"], ["status=CORROBORATED", "Đã đối chứng"], ["status=VERIFIED", "Đã xác minh"], ["status=REJECTED", "Đã từ chối"]] as const;

export default function ReportQueue() {
  const [filter, setFilter] = useState<string>("held=true");
  const { data, error, loading, reload } = useApi<{ items: Row[] }>(`/v1/admin/reports?${filter}&limit=100`);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function act(id: string, action: "VERIFY" | "REJECT" | "HIDE" | "RELEASE") {
    if (reason.trim().length < 3) { setMsg("Hãy ghi lý do (ít nhất 3 ký tự) — lý do được lưu vào nhật ký kiểm duyệt."); return; }
    try { const r = await call<{ stateChanged: boolean }>(`/v1/admin/reports/${id}/moderate`, { method: "POST", body: { action, reason: reason.trim() } }); setMsg(`Đã ${action === "VERIFY" ? "xác minh" : action === "REJECT" ? "từ chối" : action === "HIDE" ? "ẩn" : "thả"}.${r.stateChanged ? " Tình trạng công khai đã thay đổi." : ""}`); await reload(); }
    catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Báo cáo cần duyệt</h1>
      <div className="segmented" role="group" aria-label="Lọc">{FILTERS.map(([v, l]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}</div>
      <div className="field"><label htmlFor="reason">Lý do cho thao tác tiếp theo</label><input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ví dụ: đã đối chiếu camera giao thông" /></div>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? <div className="empty"><h3>Hàng đợi trống</h3><p>Không có báo cáo nào khớp bộ lọc.</p></div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Báo cáo</th><th>Người báo</th><th>Trạng thái</th><th>Ô vị trí</th><th>Thao tác</th></tr></thead><tbody>
          {data.items.map((r) => (
            <tr key={r.id}>
              <td><strong>{domainLabel(r.domain)}: {r.valueLabel}</strong><div className="xsmall muted">{relativeTime(r.observedAt)}{r.note ? ` · “${r.note}”` : ""}</div></td>
              <td>{r.reporter ? <>{r.reporter.displayName}<div className="xsmall muted">Tin cậy {Math.round(r.reporter.trustScore * 100)}%</div></> : <span className="muted">Đã ẩn danh</span>}</td>
              <td><span className="badge">{r.status}</span>{r.heldForReview ? <div className="xsmall">bị giữ</div> : null}<div className="xsmall muted">{r.confirmCount}✓ {r.denyCount}✗</div></td>
              <td><a className="xsmall" href={`/ban-do?at=${r.approximateCoordinate[1]},${r.approximateCoordinate[0]}`}>{r.cell}</a></td>
              <td><div className="row">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void act(r.id, "VERIFY")}>Xác minh</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => void act(r.id, "REJECT")}>Từ chối</button>
                {r.heldForReview ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => void act(r.id, "RELEASE")}>Thả</button> : null}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void act(r.id, "HIDE")}>Ẩn</button>
              </div></td>
            </tr>))}
        </tbody></table></div>
      )}
    </section>
  );
}
