"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

type U = { id: string; email: string; displayName: string; role: string; status: string; trustScore: number; createdAt: string; reports: number; rejectedReports: number };
export default function Users() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useApi<{ items: U[] }>(`/v1/admin/users?limit=100${query.length >= 2 ? `&q=${encodeURIComponent(query)}` : ""}`);
  const [msg, setMsg] = useState<string | null>(null);
  async function update(id: string, body: object) {
    const reason = window.prompt("Lý do (lưu vào nhật ký kiểm duyệt):")?.trim();
    if (!reason || reason.length < 3) return;
    try { await call(`/v1/admin/users/${id}`, { method: "PATCH", body: { ...body, reason } }); setMsg("Đã cập nhật."); await reload(); }
    catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Người dùng và lạm dụng</h1>
      <form role="search" className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}><label htmlFor="uq" className="visually-hidden">Tìm người dùng</label><input id="uq" className="input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email hoặc tên" /><button className="btn btn-secondary" type="submit">Tìm</button></form>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Tin cậy</th><th>Báo cáo</th><th /></tr></thead><tbody>
          {data!.items.map((u) => <tr key={u.id}>
            <td><strong>{u.displayName}</strong><div className="xsmall muted">{u.email} · từ {dateTime(u.createdAt)}</div></td>
            <td>{u.role}</td><td><span className="badge" data-tone={u.status === "active" ? "ok" : "bad"}>{u.status}</span></td>
            <td>{Math.round(u.trustScore * 100)}%</td><td>{u.reports} ({u.rejectedReports} bị từ chối)</td>
            <td><div className="row">{u.status === "active" ? <button type="button" className="btn btn-danger btn-sm" onClick={() => void update(u.id, { status: "suspended" })}>Tạm khóa</button> : <button type="button" className="btn btn-secondary btn-sm" onClick={() => void update(u.id, { status: "active" })}>Mở khóa</button>}</div></td>
          </tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
