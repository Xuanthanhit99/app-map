"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Glyph, IconCompass, IconDecide, IconMap, IconRoute, IconUser } from "./icons";

const NAV = [
  { href: "/", label: "Khám phá", icon: IconCompass },
  { href: "/ban-do", label: "Bản đồ", icon: IconMap },
  { href: "/di-dau", label: "Đi đâu", icon: IconDecide },
  { href: "/hanh-trinh", label: "Hành trình", icon: IconRoute },
];
const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function SiteHeader({ user }: { user: { displayName: string; role: string } | null }) {
  const path = usePathname();
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="REALITY — trang chủ"><Glyph /> Reality</Link>
      <nav className="site-nav" aria-label="Điều hướng chính">
        {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}>{n.label}</Link>)}
        <Link href="/cau-chuyen" aria-current={isActive(path, "/cau-chuyen") ? "page" : undefined}>Câu chuyện</Link>
      </nav>
      <div className="header-actions">
        {user ? (
          <>
            {user.role !== "user" ? <Link className="btn btn-quiet btn-sm" href="/quan-tri">Quản trị</Link> : null}
            <Link className="btn btn-secondary btn-sm" href="/tai-khoan">{user.displayName}</Link>
          </>
        ) : (
          <>
            <Link className="btn btn-quiet btn-sm" href={`/dang-nhap?next=${encodeURIComponent(path)}`}>Đăng nhập</Link>
            <Link className="btn btn-primary btn-sm" href="/dang-ky">Tạo tài khoản</Link>
          </>
        )}
      </div>
    </header>
  );
}

export function TabBar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const items = [...NAV, { href: signedIn ? "/tai-khoan" : "/dang-nhap", label: "Tôi", icon: IconUser }];
  return (
    <nav className="tabbar" aria-label="Điều hướng nhanh">
      {items.map((n) => <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}><n.icon />{n.label}</Link>)}
    </nav>
  );
}
