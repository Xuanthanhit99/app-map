import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { apiOrNull } from "@/lib/server-api";
import type { Place } from "@/lib/types";

type Area = { area: { id: string; name: string; description: string | null }; categories: { id: string; label: string; placeCount: number; indexable: boolean }[]; featuredPlaces: Place[]; indexable: boolean };
const load = (id: string) => apiOrNull<Area>(`/v1/areas/${encodeURIComponent(id)}`, { revalidate: 600 });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await load((await params).id);
  if (!a) return { title: "Không tìm thấy khu vực", robots: { index: false } };
  return { title: `Khám phá ${a.area.name}`, description: `Địa điểm ở ${a.area.name} theo loại, kèm tình trạng hiện tại đã kiểm chứng và nguồn dữ liệu.`,
    alternates: { canonical: `/khu-vuc/${a.area.id}` }, robots: { index: a.indexable, follow: true } };
}

export default async function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await load((await params).id);
  if (!a) notFound();
  const list = { "@context": "https://schema.org", "@type": "ItemList", name: `Địa điểm tiêu biểu ở ${a.area.name}`,
    itemListElement: a.featuredPlaces.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/dia-diem/${p.slug}`, name: p.name })) };
  return (
    <div className="page stack-lg">
      {a.featuredPlaces.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(list) }} /> : null}
      <header className="stack"><h1>{a.area.name}</h1><p className="lede">{a.area.description ?? `Các địa điểm ở ${a.area.name} theo dữ liệu OpenStreetMap, cùng tình trạng hiện tại khi đã được kiểm chứng.`}</p></header>
      <section aria-labelledby="cats" className="stack"><h2 id="cats">Theo loại địa điểm</h2>
        <ul className="grid-3 list-plain">{a.categories.filter((c) => c.placeCount > 0).map((c) => <li key={c.id}><Link className="entry" href={`/khu-vuc/${a.area.id}/${c.id}`}><strong style={{ fontSize: "var(--t-md)" }}>{c.label}</strong><span>{c.placeCount} địa điểm</span></Link></li>)}</ul>
        {a.categories.every((c) => c.placeCount === 0) ? <div className="empty"><h3>Chưa có địa điểm nào được nạp cho khu vực này</h3><p>Dữ liệu đang được đồng bộ từ OpenStreetMap.</p></div> : null}
      </section>
      {a.featuredPlaces.length ? <section aria-labelledby="feat" className="stack"><h2 id="feat">Địa điểm có thông tin đầy đủ</h2>
        <ul className="list-plain grid-3">{a.featuredPlaces.map((p) => <li key={p.id} className="panel panel-tight"><Link href={`/dia-diem/${p.slug}`}><strong>{p.name}</strong></Link><p className="small muted">{p.categoryLabel}{p.address ? ` · ${p.address}` : ""}</p></li>)}</ul></section> : null}
      <p><Link className="btn btn-primary" href="/ban-do">Mở bản đồ {a.area.name}</Link></p>
    </div>
  );
}
