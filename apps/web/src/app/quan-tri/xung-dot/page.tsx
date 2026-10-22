import { api } from "@/lib/server-api";
import { relativeTime } from "@/lib/format";
import { domainLabel } from "@/components/state";

type C = { subjectKey: string; domain: string; freshness: string | null; since: string; coordinate: [number, number] };
export default async function Conflicts() {
  const r = await api<{ items: C[] }>("/v1/admin/conflicts", { auth: true });
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Xung đột hiện tại</h1>
      <p className="small muted">Nơi các nguồn đáng tin đang cho tín hiệu khác nhau. Xử lý bằng cách xác minh hoặc từ chối báo cáo cụ thể trong hàng đợi báo cáo; hệ thống không tự chọn bên.</p>
      {r.items.length === 0 ? <div className="empty"><h3>Không có xung đột</h3><p>Chưa có nơi nào đang mâu thuẫn.</p></div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Loại</th><th>Đối tượng</th><th>Từ khi</th><th /></tr></thead><tbody>
          {r.items.map((c) => <tr key={c.subjectKey}><td>{domainLabel(c.domain)}</td><td className="xsmall">{c.subjectKey}</td><td>{relativeTime(c.since)}</td><td><a href={`/ban-do?at=${c.coordinate[1]},${c.coordinate[0]}`}>Xem bản đồ</a> · <a href="/quan-tri/bao-cao?status=DISPUTED">Báo cáo mâu thuẫn</a></td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
