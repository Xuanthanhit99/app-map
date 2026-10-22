import type { MetadataRoute } from "next";
import { API_URL, SITE_URL } from "@/lib/config";

export const revalidate = 3600;
type Entries = { places: { slug: string; updatedAt: string }[]; stories: { slug: string; updatedAt: string }[]; areas: { id: string; updatedAt: string }[]; categories: { areaId: string; category: string; updatedAt: string }[] };

/** Only indexable entities (see API INDEXABILITY policy) — no thin pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = ["", "/ban-do", "/di-dau", "/cau-chuyen", "/du-lieu", "/gioi-thieu", "/tro-giup", "/quyen-rieng-tu", "/dieu-khoan"]
    .map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: p === "" ? "hourly" : "weekly", priority: p === "" ? 1 : 0.6 }));
  let e: Entries | null = null;
  try { e = await (await fetch(`${API_URL}/v1/seo/sitemap`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10_000) })).json(); } catch { e = null; }
  if (!e) return fixed;
  return [
    ...fixed,
    ...e.areas.map((a) => ({ url: `${SITE_URL}/khu-vuc/${a.id}`, lastModified: a.updatedAt, priority: 0.8 })),
    ...e.categories.map((c) => ({ url: `${SITE_URL}/khu-vuc/${c.areaId}/${c.category}`, lastModified: c.updatedAt, priority: 0.7 })),
    ...e.places.map((p) => ({ url: `${SITE_URL}/dia-diem/${p.slug}`, lastModified: p.updatedAt, priority: 0.5 })),
    ...e.stories.map((s) => ({ url: `${SITE_URL}/cau-chuyen/${s.slug}`, lastModified: s.updatedAt, priority: 0.6 })),
  ];
}
