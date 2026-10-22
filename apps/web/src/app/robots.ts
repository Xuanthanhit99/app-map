import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  // Non-production deployments must never be indexed.
  if (process.env.SITE_INDEXING !== "true") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/tai-khoan", "/quan-tri", "/hanh-trinh/", "/chia-se/", "/dang-nhap", "/dang-ky"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
