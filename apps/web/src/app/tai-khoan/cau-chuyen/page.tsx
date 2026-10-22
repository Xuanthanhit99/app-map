"use client";
import Link from "next/link";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import type { Story } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { useState } from "react";

const STATUS: Record<string, string> = { DRAFT: "Bản nháp", PENDING_REVIEW: "Chờ duyệt", PUBLISHED: "Đã xuất bản", REJECTED: "Cần sửa", ARCHIVED: "Đã lưu trữ" };
export default function MyStories() {
  const { data, error, loading, reload } = useApi<{ items: Story[] }>("/v1/me/stories");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="stack" aria-labelledby="h">
      <div className="row" style={{ justifyContent: "space-between" }}><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Câu chuyện của tôi</h1><Link className="btn btn-primary btn-sm" href="/tai-khoan/cau-chuyen/moi">Viết câu chuyện</Link></div>
      <p className="small muted">Câu chuyện gắn với một địa điểm, cần ít nhất một nguồn tham khảo và được kiểm duyệt trước khi xuất bản.</p>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? <div className="empty"><h3>Chưa có câu chuyện</h3><p>Chia sẻ lịch sử hay điều đáng biết về một nơi bạn hiểu rõ.</p></div> : (
        <ul className="list-plain divided panel panel-tight">{data.items.map((s) => (
          <li key={s.id} className="row" style={{ padding: "12px 0", justifyContent: "space-between" }}>
            <div><strong>{s.title}</strong> <span className="badge">{STATUS[s.status]}</span><p className="small muted">{s.place?.name ?? "Không gắn địa điểm"}</p></div>
            <div className="row">
              {s.status === "PUBLISHED" ? <Link className="btn btn-quiet btn-sm" href={`/cau-chuyen/${s.slug}`}>Xem</Link> : null}
              {["DRAFT", "REJECTED"].includes(s.status) ? <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { try { await call(`/v1/stories/${s.id}/submit`, { method: "POST" }); setMsg("Đã gửi duyệt."); await reload(); } catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); } }}>Gửi duyệt</button> : null}
            </div>
          </li>))}</ul>
      )}
    </section>
  );
}
