"use client";
import Link from "next/link";
import { call } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Notification } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/dash-nav";

const SEV: Record<string, string> = { SAFETY_CRITICAL: "bad", SIGNIFICANT: "warn", MINOR: "warn", INFO: "" };
export default function Notifications() {
  const { data, error, loading, reload } = useApi<{ unreadCount: number; items: Notification[] }>("/v1/me/notifications?limit=100");
  return (
    <section className="stack" aria-labelledby="h">
      <div className="row" style={{ justifyContent: "space-between" }}><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Thông báo</h1>
        {data?.unreadCount ? <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await call("/v1/me/notifications/read", { method: "POST", body: { all: true } }); await reload(); }}>Đánh dấu đã đọc tất cả</button> : null}</div>
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? (
        <div className="empty"><h3>Không có thông báo</h3><p>Bạn sẽ nhận thông báo khi khu vực bạn theo dõi hoặc tuyến đường đang đi có thay đổi đáng kể.</p><Link className="btn btn-secondary" href="/tai-khoan/theo-doi">Quản lý khu vực theo dõi</Link></div>
      ) : (
        <ul className="list-plain divided panel panel-tight">{data.items.map((n) => (
          <li key={n.id} style={{ padding: "12px 0", opacity: n.readAt ? 0.7 : 1 }}>
            <div className="row"><span className="badge" data-tone={SEV[n.severity]}>{n.kind === "JOURNEY_IMPACT" ? "Hành trình" : n.kind === "WATCH_CHANGE" ? "Khu vực theo dõi" : "Hệ thống"}</span>{!n.readAt ? <span className="visually-hidden">Chưa đọc</span> : null}<strong>{n.title}</strong></div>
            <p className="small muted">{n.body} · {dateTime(n.createdAt)}</p>
            {typeof n.data.journeyId === "string" ? <Link className="small" href={`/hanh-trinh/${n.data.journeyId}`}>Xem hành trình</Link> : null}
          </li>))}</ul>
      )}
    </section>
  );
}
