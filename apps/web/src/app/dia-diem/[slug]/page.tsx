import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { LazyMiniMap } from "@/components/map/lazy";
import { PlaceActions } from "@/components/place-actions";
import { StateCard, domainLabel, valueLabel } from "@/components/state";
import { SITE_URL } from "@/lib/config";
import { dateTime, relativeTime } from "@/lib/format";
import { api, apiOrNull } from "@/lib/server-api";
import { currentUser } from "@/lib/session";
import type { PlaceDetail } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA_TYPE: Record<string, string> = { cafe: "CafeOrCoffeeShop", restaurant: "Restaurant", fast_food: "FastFoodRestaurant", bar: "BarOrPub", park: "Park", museum: "Museum",
  attraction: "TouristAttraction", viewpoint: "TouristAttraction", worship: "PlaceOfWorship", market: "Store", mall: "ShoppingCenter", cinema: "MovieTheater", library: "Library",
  playground: "Playground", sports: "SportsActivityLocation", hospital: "Hospital", pharmacy: "Pharmacy", parking: "ParkingFacility", fuel: "GasStation", hotel: "Hotel" };

async function load(slug: string) {
  return apiOrNull<PlaceDetail>(`/v1/places/${encodeURIComponent(slug)}`, { revalidate: 60 });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: "Không tìm thấy địa điểm", robots: { index: false } };
  const seo = await apiOrNull<{ indexable: boolean }>(`/v1/seo/places/${d.place.slug}`, { revalidate: 600 });
  const description = `${d.place.categoryLabel}${d.place.address ? ` tại ${d.place.address}` : ""}. Tình trạng hiện tại đã kiểm chứng, nguồn và độ mới của thông tin trên Reality.`;
  return {
    title: `${d.place.name} — ${d.place.categoryLabel}`,
    description,
    alternates: { canonical: `/dia-diem/${d.place.slug}` },
    robots: seo?.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: d.place.name, description, url: `/dia-diem/${d.place.slug}`, type: "website" },
  };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  if (UUID.test(slug)) permanentRedirect(`/dia-diem/${d.place.slug}`);
  const user = await currentUser();
  const saved = user ? (await api<PlaceDetail>(`/v1/places/${d.place.id}`, { auth: true })).saved : false;
  const p = d.place;
  const known = d.states.filter((s) => s.truth !== "UNKNOWN" || s.signals.length);
  const unknownDomains = d.states.filter((s) => s.truth === "UNKNOWN" && !s.signals.length && (s.domain !== "PARKING" || p.category === "parking")).map((s) => domainLabel(s.domain).toLowerCase());
  const simpleHours = p.openingHours && /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))? \d{2}:\d{2}-\d{2}:\d{2}$/.test(p.openingHours.raw) ? p.openingHours.raw : undefined;
  const jsonLd = {
    "@context": "https://schema.org", "@type": SCHEMA_TYPE[p.category] ?? "Place", name: p.name, url: `${SITE_URL}/dia-diem/${p.slug}`,
    geo: { "@type": "GeoCoordinates", latitude: p.coordinate[1], longitude: p.coordinate[0] },
    ...(p.address ? { address: { "@type": "PostalAddress", streetAddress: p.address, addressLocality: "Hà Nội", addressCountry: "VN" } } : {}),
    ...(simpleHours ? { openingHours: simpleHours } : {}), ...(p.website ? { sameAs: [p.website] } : {}), ...(p.phone ? { telephone: p.phone } : {}),
  };
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Hà Nội", item: `${SITE_URL}/khu-vuc/ha-noi` },
    { "@type": "ListItem", position: 2, name: p.categoryLabel, item: `${SITE_URL}/khu-vuc/ha-noi/${p.category}` },
    { "@type": "ListItem", position: 3, name: p.name, item: `${SITE_URL}/dia-diem/${p.slug}` } ] };
  return (
    <div className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <nav className="breadcrumbs" aria-label="Đường dẫn"><ol><li><Link href="/khu-vuc/ha-noi">Hà Nội</Link></li><li><Link href={`/khu-vuc/ha-noi/${p.category}`}>{p.categoryLabel}</Link></li><li aria-current="page">{p.name}</li></ol></nav>
      <div className="place-head">
        <div className="stack">
          <p className="cat">{p.categoryLabel}</p>
          <h1>{p.name}</h1>
          {p.address ? <p className="muted">{p.address}</p> : null}
        </div>
      </div>
      <div style={{ marginTop: "var(--s5)" }}><PlaceActions placeId={p.id} slug={p.slug} saved={saved} signedIn={Boolean(user)} /></div>
      <div className="place-layout">
        <div className="stack-lg">
          <section aria-labelledby="now-h" className="stack">
            <h2 id="now-h">Tình trạng lúc này</h2>
            {known.length ? <div className="stack">{known.map((s) => <StateCard key={s.subjectKey} state={s} />)}</div> : null}
            {unknownDomains.length ? (
              <div className="empty"><h3>Chưa rõ: {unknownDomains.join(", ")}</h3><p>Chưa có báo cáo đã đối chứng hoặc nguồn trực tiếp nào gần đây. Nếu bạn đang ở đây, bạn có thể giúp người khác biết.</p><Link className="btn btn-secondary" href={`/ban-do?place=${p.slug}&report=1`}>Báo tình trạng tại đây</Link></div>
            ) : null}
            <p className="xsmall muted">Đánh giá lúc {dateTime(d.evaluatedAt)}. Mỗi tình trạng cần nguồn chính thức, kiểm duyệt viên, hoặc ít nhất hai người khác nhau cùng báo.</p>
          </section>
          {d.recentReports.length ? (
            <section aria-labelledby="rep-h" className="stack">
              <h2 id="rep-h">Báo cáo gần đây</h2>
              <ul className="list-plain divided panel panel-tight">{d.recentReports.map((r) => <li key={r.id} style={{ padding: "10px 0" }}><strong>{domainLabel(r.domain)}: {valueLabel(r.domain, r.value)}</strong> <span className="small muted">· {r.status === "CORROBORATED" ? "đã đối chứng" : r.status === "VERIFIED" ? "đã xác minh" : r.status === "DISPUTED" ? "đang mâu thuẫn" : "chưa xác minh"} · {relativeTime(r.observedAt)}</span></li>)}</ul>
            </section>
          ) : null}
          <section aria-labelledby="stories-h" className="stack">
            <h2 id="stories-h">Câu chuyện về nơi này</h2>
            {d.stories.length ? <ul className="list-plain stack">{d.stories.map((s) => <li key={s.id}><Link href={`/cau-chuyen/${s.slug}`}><strong>{s.title}</strong></Link><p className="small muted">{s.summary}</p></li>)}</ul>
              : <p className="small muted">Chưa có câu chuyện nào được xuất bản. <Link href={`/tai-khoan/cau-chuyen/moi?place=${p.id}`}>Viết câu chuyện có nguồn tham khảo</Link>.</p>}
          </section>
        </div>
        <aside className="stack" aria-label="Thông tin địa điểm">
          <LazyMiniMap center={p.coordinate} label={p.name} />
          <dl className="facts">
            {p.openingHours ? <><dt>Giờ mở cửa</dt><dd>{p.openingHours.raw}<br /><span className="xsmall muted">{p.openingHours.note}</span></dd></> : null}
            {p.phone ? <><dt>Điện thoại</dt><dd><a href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a></dd></> : null}
            {p.website ? <><dt>Trang web</dt><dd><a href={p.website} rel="nofollow noopener" target="_blank">{p.website.replace(/^https?:\/\//, "").slice(0, 40)}</a></dd></> : null}
            <dt>Xe lăn</dt><dd>{p.wheelchair === "yes" ? "Tiếp cận được" : p.wheelchair === "limited" ? "Hạn chế" : p.wheelchair === "no" ? "Không tiếp cận được" : "Chưa rõ"}</dd>
            <dt>Nguồn</dt><dd>{p.source.attribution} ({p.source.license})</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
