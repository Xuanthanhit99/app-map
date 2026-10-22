"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashNav({ items, label }: { items: ({ href: string; label: string } | { group: string })[]; label: string }) {
  const path = usePathname();
  return (
    <nav className="dash-nav" aria-label={label}>
      {items.map((i, k) => "group" in i ? <span key={k} className="group">{i.group}</span>
        : <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>{i.label}</Link>)}
    </nav>
  );
}
export function Loading({ label = "Đang tải…" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="stack"><div className="skeleton" style={{ height: 20, width: "40%" }} /><div className="skeleton" style={{ height: 64 }} /><span className="visually-hidden">{label}</span></div>;
}
export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice notice-error" role="alert"><span>{message} {retry ? <button type="button" className="btn btn-quiet btn-sm" onClick={retry}>Thử lại</button> : null}</span></div>;
}
