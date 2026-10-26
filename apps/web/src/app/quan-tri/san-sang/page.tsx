import { api } from "@/lib/server-api";
import { dateTime } from "@/lib/format";

type Domain = { verdict: string; note?: string; total?: number; tilesIngested48h?: number; tilesTotal?: number; cellsCovered?: number; cellsTotal?: number; activeReports?: number; latestSuccessAt?: string | null; newestModelTime?: string | null };
type R = { generatedAt: string; regions: { region: { id: string; name: string }; domains: Record<string, Domain>; queryPerformance: { nearbySearchMs: { p50: number; p95: number } } }[] };
const TONE: Record<string, string> = { READY: "ok", PARTIAL: "warn", COMMUNITY_ONLY: "warn", NOT_INGESTED: "bad", NO_PROVIDER: "bad" };

export default async function Readiness() {
  const r = await api<R>("/v1/admin/data-readiness", { auth: true });
  return (
    <section className="stack-lg" aria-labelledby="h">
      <div className="stack"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Độ sẵn sàng dữ liệu (G2)</h1><p className="small muted">Đo trực tiếp từ cơ sở dữ liệu lúc {dateTime(r.generatedAt)}. Không tính những gì nhà cung cấp hứa hẹn.</p></div>
      {r.regions.map((g) => (
        <div key={g.region.id} className="stack">
          <h2>{g.region.name}</h2>
          <div className="table-wrap"><table className="data"><thead><tr><th>Miền dữ liệu</th><th>Kết luận</th><th>Đo được</th><th>Ghi chú</th></tr></thead><tbody>
            {Object.entries(g.domains).map(([k, d]) => <tr key={k}><td>{k}</td><td><span className="badge" data-tone={TONE[d.verdict]}>{d.verdict}</span></td>
              <td className="small">{d.total !== undefined ? `${d.total} địa điểm · ${d.tilesIngested48h}/${d.tilesTotal} ô nạp trong 48h` : d.cellsTotal !== undefined ? `${d.cellsCovered}/${d.cellsTotal} ô thời tiết còn hiệu lực` : d.activeReports !== undefined ? `${d.activeReports} báo cáo hiện hành` : "—"}</td>
              <td className="xsmall muted">{d.note ?? (d.latestSuccessAt ? `Lần nạp: ${dateTime(d.latestSuccessAt)}` : d.newestModelTime ? `Mốc mô hình: ${dateTime(d.newestModelTime)}` : "")}</td></tr>)}
          </tbody></table></div>
          <p className="small">Truy vấn “gần đây” p50 {g.queryPerformance.nearbySearchMs.p50} ms · p95 {g.queryPerformance.nearbySearchMs.p95} ms.</p>
        </div>
      ))}
    </section>
  );
}
