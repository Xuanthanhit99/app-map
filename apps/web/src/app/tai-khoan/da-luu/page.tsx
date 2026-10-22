"use client";
import Link from "next/link";
import { call } from "@/lib/client-api";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

type Saved = { placeId: string; slug: string; name: string; category: string; address: string | null; label: string | null };
export default function SavedPlaces() {
  const { data, error, loading, reload } = useApi<{ items: Saved[] }>("/v1/me/saved-places");
  return (
    <section className="stack" aria-labelledby="h"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Địa điểm đã lưu</h1>
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : !data?.items.length ? (
        <div className="empty"><h3>Bạn chưa lưu địa điểm nào</h3><p>Mở một địa điểm trên bản đồ và chọn “Lưu” để quay lại nhanh hơn.</p><Link className="btn btn-secondary" href="/ban-do">Mở bản đồ</Link></div>
      ) : (
        <ul className="list-plain divided panel panel-tight">{data.items.map((p) => (
          <li key={p.placeId} className="row" style={{ padding: "12px 0", justifyContent: "space-between" }}>
            <div><Link href={`/dia-diem/${p.slug}`}><strong>{p.name}</strong></Link><p className="small muted">{p.address ?? ""}</p></div>
            <div className="row"><Link className="btn btn-secondary btn-sm" href={`/hanh-trinh?to=${p.slug}`}>Chỉ đường</Link><button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await call(`/v1/me/saved-places/${p.placeId}`, { method: "DELETE" }); await reload(); }}>Bỏ lưu</button></div>
          </li>))}</ul>
      )}
    </section>
  );
}
