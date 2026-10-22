import Link from "next/link";
import { Contours } from "@/components/contours";
import { StateChip, valueLabel } from "@/components/state";
import { IconInfo } from "@/components/icons";
import { DEFAULT_AREA, SITE_URL } from "@/lib/config";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/server-api";
import type { PulseItem } from "@/lib/types";

export const revalidate = 60;

type Pulse = { status: "ready" | "empty"; items: PulseItem[]; evaluatedAt: string };
type Readiness = { categories: { id: string; label: string; placeCount: number }[] };

async function load() {
  const bbox = DEFAULT_AREA.bbox.join(",");
  const [pulse, cats] = await Promise.allSettled([
    api<Pulse>(`/v1/reality/pulse?bbox=${bbox}&hours=6`, { revalidate: 60 }),
    api<{ items: Readiness["categories"] }>("/v1/places/categories", { revalidate: 300 }),
  ]);
  return { pulse: pulse.status === "fulfilled" ? pulse.value : null, categories: cats.status === "fulfilled" ? cats.value.items : null };
}

export default async function Home() {
  const { pulse, categories } = await load();
  const known = pulse?.items.filter((i) => i.truth === "KNOWN") ?? [];
  const uncertain = pulse?.items.filter((i) => i.truth !== "KNOWN") ?? [];
  const placeTotal = categories?.reduce((s, c) => s + c.placeCount, 0) ?? 0;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "Reality", url: SITE_URL, inLanguage: "vi",
    potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/ban-do?q={search_term_string}`, "query-input": "required name=search_term_string" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="hero" aria-labelledby="hero-title">
        <Contours />
        <div className="hero-inner">
          <div>
            <h1 id="hero-title">Biết điều gì đang thật sự xảy ra, trước khi bạn ra đường.</h1>
            <p className="lede">Reality gom các tín hiệu đã được đối chứng về đường sá, thời tiết và địa điểm ở Hà Nội — và nói thẳng khi chưa có đủ bằng chứng.</p>
            <form className="hero-search" action="/ban-do" role="search">
              <label htmlFor="q" className="visually-hidden">Tìm địa điểm</label>
              <input id="q" name="q" className="input" placeholder="Tìm quán cà phê, bảo tàng, công viên…" minLength={2} maxLength={120} />
              <button className="btn" type="submit">Tìm</button>
            </form>
          </div>
          <aside className="ledger" aria-labelledby="ledger-title">
            <h2 id="ledger-title">Hà Nội, 6 giờ qua</h2>
            <p className="when">{pulse ? `Đánh giá ${relativeTime(pulse.evaluatedAt)}` : "Chưa kết nối được dữ liệu"}</p>
            <ul>
              <li><span className="mark" data-k="known" aria-hidden>✓</span><span>{pulse ? `${known.length} tình trạng đã được xác nhận` : "Không tải được tình trạng"}</span></li>
              <li><span className="mark" data-k="unknown" aria-hidden>?</span><span>{pulse ? `${uncertain.length} tín hiệu chưa xác minh hoặc mâu thuẫn` : "—"}</span></li>
              <li><span className="mark" data-k="none" aria-hidden>·</span><span>Nơi không có tín hiệu là nơi chưa biết, không phải nơi an toàn.</span></li>
            </ul>
          </aside>
        </div>
      </section>

      <div className="page stack-lg">
        <section aria-labelledby="entry-title" className="stack">
          <h2 id="entry-title" className="visually-hidden">Bắt đầu</h2>
          <div className="entry-grid">
            <Link className="entry" href="/di-dau"><strong>Đi đâu bây giờ?</strong><span>Nói điều bạn muốn làm. Nhận vài lựa chọn kèm lý do và những gì còn chưa rõ.</span></Link>
            <Link className="entry" href="/ban-do"><strong>Xem bản đồ tình trạng</strong><span>Địa điểm, đường sá và thời tiết quanh bạn, với nguồn và độ mới của từng tín hiệu.</span></Link>
            <Link className="entry" href="/ban-do?report=1"><strong>Báo điều bạn đang thấy</strong><span>Một chạm để báo ngập, tắc đường hay bãi xe đầy. Hai người xác nhận thì tín hiệu mới được tin.</span></Link>
          </div>
        </section>

        <section aria-labelledby="pulse-title" className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="pulse-title">Thay đổi gần đây</h2>
            <Link href="/ban-do" className="small">Mở bản đồ</Link>
          </div>
          {!pulse ? (
            <div className="notice notice-error" role="status"><IconInfo />Không tải được thay đổi gần đây. Máy chủ dữ liệu tạm thời không phản hồi.</div>
          ) : pulse.items.length === 0 ? (
            <div className="empty"><h3>Chưa có thay đổi nào được ghi nhận trong 6 giờ qua</h3><p>Điều này không có nghĩa mọi thứ đều ổn. Nếu bạn đang thấy ngập, tắc đường hay bãi xe đầy, hãy báo để người khác biết.</p><Link className="btn btn-primary" href="/ban-do?report=1">Báo tình trạng</Link></div>
          ) : (
            <ul className="pulse-list list-plain">
              {pulse.items.slice(0, 8).map((i) => (
                <li key={i.id} className="pulse-item">
                  <StateChip state={{ truth: i.truth, safety: i.safety, label: i.headline, domain: i.domain, freshness: i.freshness }} />
                  <div><div>{i.headline ?? valueLabel(i.domain, i.value)}</div><div className="meta">{relativeTime(i.change.at)} · {i.sources.map((s) => s.name).join(", ") || "chưa có nguồn xác nhận"}</div></div>
                  <Link className="btn btn-quiet btn-sm" href={i.placeId ? `/dia-diem/${i.placeId}` : `/ban-do?at=${i.coordinate[1]},${i.coordinate[0]}`}>{i.followUp === "HELP_VERIFY" ? "Giúp xác minh" : "Xem"}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="trust-title" className="grid-2">
          <div className="stack">
            <h2 id="trust-title">Cách Reality quyết định điều gì là thật</h2>
            <p className="muted">Một báo cáo đơn lẻ chỉ là tín hiệu. Tình trạng được xác nhận khi có hai người khác nhau cùng báo, khi kiểm duyệt viên xác minh, hoặc khi nguồn chính thức cung cấp. Mỗi tình trạng luôn đi kèm nguồn, thời điểm và độ tin cậy.</p>
            <Link href="/du-lieu">Xem các nguồn dữ liệu và giới hạn hiện tại</Link>
          </div>
          <div className="panel stack" aria-label="Ba trạng thái của thông tin">
            <div className="row"><StateChip state={{ truth: "KNOWN", safety: "AVOID", label: "Ngập vừa", domain: "ROAD", freshness: "FRESH" }} /><span className="small muted">Đã xác nhận, còn mới</span></div>
            <div className="row"><StateChip state={{ truth: "UNKNOWN", safety: "NONE", label: null, domain: "ROAD", freshness: null }} /><span className="small muted">Chưa đủ bằng chứng</span></div>
            <div className="row"><StateChip state={{ truth: "CONFLICT", safety: "NONE", label: null, domain: "ROAD", freshness: "FRESH" }} /><span className="small muted">Các nguồn đang mâu thuẫn</span></div>
          </div>
        </section>

        <section aria-labelledby="cat-title" className="stack">
          <h2 id="cat-title">Khám phá Hà Nội</h2>
          {categories ? (
            placeTotal ? (
              <div className="chips">{categories.filter((c) => c.placeCount > 0).map((c) => <Link key={c.id} className="chip-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={`/khu-vuc/ha-noi/${c.id}`}>{c.label} <span className="muted" style={{ marginLeft: 6 }}>{c.placeCount}</span></Link>)}</div>
            ) : <div className="empty"><h3>Chưa có địa điểm nào được nạp</h3><p>Dữ liệu địa điểm từ OpenStreetMap chưa được đồng bộ cho khu vực này.</p></div>
          ) : <div className="notice notice-error"><IconInfo />Không tải được danh mục địa điểm.</div>}
        </section>
      </div>
    </>
  );
}
