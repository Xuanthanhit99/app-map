import { api, ApiFailure } from "@/lib/server-api";
import { dateTime } from "@/lib/format";

type A = { id: number; actor_id: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; detail: Record<string, unknown>; created_at: string };
export default async function Audit() {
  let r: { items: A[] } | null = null;
  try { r = await api<{ items: A[] }>("/v1/admin/audit?limit=200", { auth: true }); } catch (e) { if (!(e instanceof ApiFailure && e.status === 403)) throw e; }
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Nhật ký kiểm toán</h1>
      {!r ? <div className="notice notice-warn">Chỉ quản trị viên xem được nhật ký kiểm toán.</div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Thời điểm</th><th>Hành động</th><th>Người thực hiện</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>
          {r.items.map((a) => <tr key={a.id}><td>{dateTime(a.created_at)}</td><td>{a.action}</td><td className="xsmall">{a.actor_role ?? "hệ thống"}<div className="muted">{a.actor_id?.slice(0, 8) ?? ""}</div></td><td className="xsmall">{a.target_type} {a.target_id?.slice(0, 12)}</td><td className="xsmall">{Object.keys(a.detail).length ? JSON.stringify(a.detail) : ""}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
