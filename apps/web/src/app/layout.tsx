import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, TabBar } from "@/components/site-chrome";
import { SITE_URL } from "@/lib/config";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Reality — Điều gì đang thật sự xảy ra quanh bạn", template: "%s · Reality" },
  description: "Xem tình trạng thực tế đã được kiểm chứng quanh bạn ở Hà Nội: đường sá, thời tiết, địa điểm. Biết khi nào thông tin còn mới, khi nào chưa rõ — rồi quyết định và lên đường.",
  applicationName: "Reality",
  openGraph: { type: "website", locale: "vi_VN", siteName: "Reality" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: "#071C2C", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main">Bỏ qua tới nội dung chính</a>
        <SiteHeader user={user ? { displayName: user.displayName, role: user.role } : null} />
        <main id="main">{children}</main>
        <SiteFooter />
        <TabBar signedIn={Boolean(user)} />
      </body>
    </html>
  );
}
