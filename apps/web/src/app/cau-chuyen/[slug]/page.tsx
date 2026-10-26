import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { dateTime } from "@/lib/format";
import { apiOrNull } from "@/lib/server-api";
import type { Story } from "@/lib/types";

const load = (slug: string) => apiOrNull<{ story: Story }>(`/v1/stories/${encodeURIComponent(slug)}`, { revalidate: 300 });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await load((await params).slug);
  if (!r) return { title: "Không tìm thấy câu chuyện", robots: { index: false } };
  return { title: r.story.title, description: r.story.summary, alternates: { canonical: `/cau-chuyen/${r.story.slug}` },
    robots: { index: r.story.status === "PUBLISHED", follow: true }, openGraph: { type: "article", title: r.story.title, description: r.story.summary, publishedTime: r.story.publishedAt ?? undefined } };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) notFound();
  const s = r.story;
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: s.title, description: s.summary, datePublished: s.publishedAt, dateModified: s.updatedAt, inLanguage: "vi",
    url: `${SITE_URL}/cau-chuyen/${s.slug}`, ...(s.author ? { author: { "@type": "Person", name: s.author.displayName } } : {}),
    ...(s.place ? { about: { "@type": "Place", name: s.place.name, url: `${SITE_URL}/dia-diem/${s.place.slug}` } } : {}),
    citation: (s.sources ?? []).map((x) => ({ "@type": "CreativeWork", name: x.title, url: x.url })) };
  return (
    <article className="page-narrow stack-lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header className="stack">
        <nav className="breadcrumbs" aria-label="Đường dẫn"><ol><li><Link href="/cau-chuyen">Câu chuyện</Link></li>{s.place ? <li><Link href={`/dia-diem/${s.place.slug}`}>{s.place.name}</Link></li> : null}</ol></nav>
        <h1>{s.title}</h1>
        <p className="lede">{s.summary}</p>
        <p className="small muted">{s.author ? `${s.author.displayName} · ` : ""}{s.status === "PUBLISHED" ? `Xuất bản ${dateTime(s.publishedAt)}` : "Chưa xuất bản (chỉ bạn và kiểm duyệt viên thấy)"}</p>
      </header>
      <div className="prose">{(s.body ?? "").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
      <section aria-labelledby="src-h" className="stack"><h2 id="src-h" style={{ fontSize: "var(--t-lg)" }}>Nguồn tham khảo</h2>
        <ul>{(s.sources ?? []).map((x) => <li key={x.url}><a href={x.url} rel="nofollow noopener noreferrer" target="_blank">{x.title}</a></li>)}</ul></section>
    </article>
  );
}
