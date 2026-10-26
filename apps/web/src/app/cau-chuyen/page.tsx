import type { Metadata } from "next";
import Link from "next/link";
import { dateTime } from "@/lib/format";
import { api } from "@/lib/server-api";
import type { Story } from "@/lib/types";

export const revalidate = 300;
export const metadata: Metadata = { title: "Câu chuyện về Hà Nội", description: "Câu chuyện có nguồn tham khảo về những địa điểm ở Hà Nội, được kiểm duyệt trước khi xuất bản.", alternates: { canonical: "/cau-chuyen" } };

export default async function Stories() {
  const r = await api<{ items: Story[] }>("/v1/stories?limit=50", { revalidate: 300 }).catch(() => null);
  return (
    <div className="page-narrow stack-lg">
      <header className="stack"><h1>Câu chuyện</h1><p className="lede">Lịch sử và điều đáng biết về các địa điểm, mỗi câu chuyện đều có nguồn tham khảo và được kiểm duyệt.</p></header>
      {!r ? <div className="notice notice-error">Không tải được câu chuyện.</div> : r.items.length === 0 ? (
        <div className="empty"><h3>Chưa có câu chuyện nào được xuất bản</h3><p>Bạn biết điều thú vị về một nơi ở Hà Nội? Hãy viết, kèm nguồn tham khảo, để kiểm duyệt viên xem xét.</p><Link className="btn btn-secondary" href="/tai-khoan/cau-chuyen/moi">Viết câu chuyện</Link></div>
      ) : (
        <ul className="list-plain stack-lg">{r.items.map((s) => (
          <li key={s.id} className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: "var(--t-lg)" }}><Link href={`/cau-chuyen/${s.slug}`}>{s.title}</Link></h2>
            <p className="muted">{s.summary}</p>
            <p className="xsmall muted">{s.place ? <>Về <Link href={`/dia-diem/${s.place.slug}`}>{s.place.name}</Link> · </> : null}{dateTime(s.publishedAt)}</p>
          </li>))}</ul>
      )}
    </div>
  );
}
