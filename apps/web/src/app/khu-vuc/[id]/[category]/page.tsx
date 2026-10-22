import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { apiOrNull } from "@/lib/server-api";
import type { Place } from "@/lib/types";

type Cat = { area: { id: string; name: string }; category: { id: string; label: string }; places: Place[]; indexable: boolean };
const load = (id: string, c: string) => apiOrNull<Cat>(`/v1/areas/${encodeURIComponent(id)}/categories/${encodeURIComponent(c)}`, { revalidate: 600 });

export async function generateMetadata({ params }: { params: Promise<{ id: string; category: string }> }): Promise<Metadata> {
  const { id, category } = await params;
  const d = await load(id, category);
  if (!d) return { title: "Không tìm thấy", robots: { index: false } };
  return { title: `${d.category.label} ở ${d.area.name}`, description: `${d.places.length} ${d.category.label.toLowerCase()} ở ${d.area.name}, kèm địa chỉ, giờ mở cửa công bố và tình trạng đã kiểm chứng khi có.`,
    alternates: { canonical: `/khu-vuc/${d.area.id}/${d.category.id}` }, robots: { index: d.indexable, follow: true } };
}

export default async function CategoryPage({ params }: { params: Promise<{ id: string; category: string }> }) {
  const { id, category } = await params;
  const d = await load(id, category);
  if (!d) notFound();
  const ld = { "@context": "https://schema.org", "@type": "ItemList", name: `${d.category.label} ở ${d.area.name}`,
    itemListElement: d.places.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/dia-diem/${p.slug}`, name: p.name })) };
  return (
    <div className="page stack-lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav className="breadcrumbs" aria-label="Đường dẫn"><ol><li><Link href={`/khu-vuc/${d.area.id}`}>{d.area.name}</Link></li><li aria-current="page">{d.category.label}</li></ol></nav>
      <header className="stack"><h1>{d.category.label} ở {d.area.name}</h1><p className="lede">{d.places.length} địa điểm theo OpenStreetMap. Tình trạng hiện tại (mở cửa, mức đông) chỉ hiển thị khi đã được kiểm chứng.</p></header>
      {d.places.length === 0 ? <div className="empty"><h3>Chưa có địa điểm nào thuộc loại này</h3><p>Hãy thử loại khác hoặc mở bản đồ.</p></div> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Tên</th><th>Địa chỉ</th><th>Giờ mở cửa công bố</th></tr></thead><tbody>
          {d.places.map((p) => <tr key={p.id}><td><Link href={`/dia-diem/${p.slug}`}>{p.name}</Link></td><td>{p.address ?? <span className="muted">Chưa có</span>}</td><td>{p.openingHours?.raw ?? <span className="muted">Chưa có</span>}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}
