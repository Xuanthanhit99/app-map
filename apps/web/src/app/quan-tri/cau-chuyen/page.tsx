"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import type { Story } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/dash-nav";

export default function StoryModeration() {
  const { data, error, loading, reload } = useApi<{ items: Story[] }>("/v1/admin/stories?status=PENDING_REVIEW");
  const [msg, setMsg] = useState<string | null>(null);
  async function act(id: string, action: "PUBLISH" | "REJECT") {
    const reason = window.prompt(action === "PUBLISH" ? "Ghi chú kiểm duyệt (đã kiểm tra nguồn…)" : "Lý do từ chối (tác giả sẽ cần sửa)")?.trim();
    if (!reason || reason.length < 3) return;
    try { await call(`/v1/admin/stories/${id}/moderate`, { method: "POST", body: { action, reason } }); setMsg(action === "PUBLISH" ? "Đã xuất bản." : "Đã từ chối."); await reload(); }
    catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Câu chuyện chờ duyệt</h1>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? <div className="empty"><h3>Không có câu chuyện chờ duyệt</h3><p>Câu chuyện mới sẽ xuất hiện ở đây sau khi tác giả gửi duyệt.</p></div> : (
        <ul className="list-plain stack">{data.items.map((s) => (
          <li key={s.id} className="panel stack">
            <h2 style={{ fontSize: "var(--t-lg)" }}>{s.title}</h2><p className="muted small">{s.summary} · {s.place?.name ?? "không gắn địa điểm"} · {s.author?.displayName ?? "ẩn danh"}</p>
            <details><summary className="small">Nội dung và nguồn</summary><div className="prose small" style={{ marginTop: 8 }}>{(s.body ?? "").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
              <ul className="small">{(s.sources ?? []).map((x) => <li key={x.url}><a href={x.url} rel="noopener noreferrer" target="_blank">{x.title}</a></li>)}</ul></details>
            <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={() => void act(s.id, "PUBLISH")}>Xuất bản</button><button type="button" className="btn btn-danger btn-sm" onClick={() => void act(s.id, "REJECT")}>Từ chối</button></div>
          </li>))}</ul>
      )}
    </section>
  );
}
