"use client";
import Link from "next/link";
import { call } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { PublicReport } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { domainLabel } from "@/components/state";

const STATUS: Record<string, [string, string]> = { PENDING: ["Chưa xác minh", ""], CORROBORATED: ["Đã đối chứng", "ok"], VERIFIED: ["Đã xác minh", "ok"], DISPUTED: ["Đang mâu thuẫn", "warn"], REJECTED: ["Bị từ chối", "bad"], EXPIRED: ["Hết hiệu lực", ""], HIDDEN: ["Đã rút", ""], DUPLICATE: ["Trùng", ""] };
export default function MyReports() {
  const { data, error, loading, reload } = useApi<{ items: PublicReport[] }>("/v1/me/reports");
  return (
    <section className="stack" aria-labelledby="h"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Báo cáo đã gửi</h1>
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? (
        <div className="empty"><h3>Bạn chưa gửi báo cáo nào</h3><p>Báo điều bạn đang thấy để giúp người khác biết tình trạng thật.</p><Link className="btn btn-secondary" href="/ban-do?report=1">Báo tình trạng</Link></div>
      ) : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Tình trạng</th><th>Trạng thái</th><th>Xác nhận</th><th>Thời điểm</th><th><span className="visually-hidden">Thao tác</span></th></tr></thead><tbody>
          {data.items.map((r) => { const [label, tone] = STATUS[r.status] ?? [r.status, ""]; const active = ["PENDING", "CORROBORATED", "DISPUTED", "VERIFIED"].includes(r.status); return (
            <tr key={r.id}><td>{domainLabel(r.domain)}: {r.valueLabel}{r.heldForReview ? <div className="xsmall muted">Đang chờ kiểm duyệt</div> : null}</td><td><span className="badge" data-tone={tone}>{label}</span></td><td>{r.confirmCount} đồng ý · {r.denyCount} phản đối</td><td>{relativeTime(r.createdAt ?? r.observedAt)}</td>
              <td>{active ? <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await call(`/v1/reports/${r.id}`, { method: "DELETE" }); await reload(); }}>Rút lại</button> : null}</td></tr>); })}
        </tbody></table></div>
      )}
    </section>
  );
}
