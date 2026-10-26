"use client";
import { call, ClientApiError } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { useState } from "react";

type S = { id: string; name: string; kind: string; license: string; commercialUse: string; nature: string; enabled: boolean; notes: string | null; health: { circuit: string; consecutiveFailures: number; lastSuccessAt: string | null; lastFailureAt: string | null; lastErrorCode: string | null } };
export default function Sources() {
  const { data, error, loading, reload } = useApi<{ items: S[] }>("/v1/admin/sources");
  const [msg, setMsg] = useState<string | null>(null);
  const patch = async (id: string, body: object) => { try { await call(`/v1/admin/sources/${id}`, { method: "PATCH", body }); await reload(); setMsg("Đã cập nhật."); } catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); } };
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Nguồn dữ liệu và sức khỏe</h1>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Nguồn</th><th>Bản chất / giấy phép</th><th>Mạch</th><th>Lần thành công</th><th>Lỗi gần nhất</th><th /></tr></thead><tbody>
          {data!.items.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong><div className="xsmall muted">{s.id}</div></td>
              <td>{s.nature}<div className="xsmall muted">{s.license} · thương mại: {s.commercialUse}</div></td>
              <td><span className="badge" data-tone={s.health.circuit === "CLOSED" ? "ok" : "bad"}>{s.health.circuit}</span>{s.health.consecutiveFailures ? <div className="xsmall">{s.health.consecutiveFailures} lỗi liên tiếp</div> : null}</td>
              <td>{s.health.lastSuccessAt ? relativeTime(s.health.lastSuccessAt) : <span className="muted">chưa có</span>}</td>
              <td>{s.health.lastErrorCode ? <>{s.health.lastErrorCode}<div className="xsmall muted">{relativeTime(s.health.lastFailureAt)}</div></> : "—"}</td>
              <td><div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => void patch(s.id, { enabled: !s.enabled })}>{s.enabled ? "Tắt" : "Bật"}</button>{s.health.circuit !== "CLOSED" ? <button type="button" className="btn btn-quiet btn-sm" onClick={() => void patch(s.id, { resetCircuit: true })}>Đặt lại mạch</button> : null}</div></td>
            </tr>))}
        </tbody></table></div>
      )}
    </section>
  );
}
