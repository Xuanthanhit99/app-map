import Link from "next/link";
import { LogoutButton } from "@/components/account/logout-button";
import { api } from "@/lib/server-api";
import type { Notification } from "@/lib/types";

type Me = { user: { displayName: string; email: string; createdAt: string; role: string }; consents: Record<string, { granted: boolean }> };

export default async function Overview() {
  const [me, notes, saved, watches] = await Promise.all([
    api<Me>("/v1/me", { auth: true }),
    api<{ unreadCount: number; items: Notification[] }>("/v1/me/notifications?limit=5", { auth: true }),
    api<{ items: unknown[] }>("/v1/me/saved-places", { auth: true }),
    api<{ items: unknown[] }>("/v1/me/watch-areas", { auth: true }),
  ]);
  const contributing = me.consents.contribution_public?.granted;
  return (
    <>
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div><h1 style={{ fontSize: "var(--t-2xl)" }}>Chào {me.user.displayName}</h1><p className="small muted">{me.user.email}</p></div>
        <LogoutButton />
      </header>
      <div className="kpis">
        <Link className="kpi" href="/tai-khoan/thong-bao" style={{ textDecoration: "none" }}><div className="v">{notes.unreadCount}</div><div className="k">thông báo chưa đọc</div></Link>
        <Link className="kpi" href="/tai-khoan/da-luu" style={{ textDecoration: "none" }}><div className="v">{saved.items.length}</div><div className="k">địa điểm đã lưu</div></Link>
        <Link className="kpi" href="/tai-khoan/theo-doi" style={{ textDecoration: "none" }}><div className="v">{watches.items.length}</div><div className="k">khu vực theo dõi</div></Link>
      </div>
      {!contributing ? <div className="notice"><span>Bạn chưa bật đóng góp công khai. Bật trong <Link href="/tai-khoan/quyen-rieng-tu">Quyền riêng tư</Link> để báo tình trạng và giúp xác nhận báo cáo của người khác.</span></div> : null}
      <section className="stack" aria-labelledby="recent-n">
        <h2 id="recent-n">Thông báo gần đây</h2>
        {notes.items.length === 0 ? <div className="empty"><h3>Chưa có thông báo</h3><p>Theo dõi một khu vực hoặc địa điểm để nhận thông báo khi tình trạng thay đổi đáng kể.</p><Link className="btn btn-secondary" href="/tai-khoan/theo-doi">Thêm khu vực theo dõi</Link></div>
          : <ul className="list-plain divided panel panel-tight">{notes.items.map((n) => <li key={n.id} style={{ padding: "10px 0" }}><strong>{n.title}</strong><p className="small muted">{n.body}</p></li>)}</ul>}
      </section>
    </>
  );
}
