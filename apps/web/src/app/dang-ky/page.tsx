import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Tạo tài khoản", robots: { index: false, follow: true } };
export default function Register() {
  return <div className="auth-card stack"><h1 style={{ fontSize: "var(--t-2xl)" }}>Tạo tài khoản</h1><p className="small muted">Tài khoản giúp bạn lưu địa điểm, theo dõi khu vực, lưu hành trình và gửi báo cáo.</p><Suspense><AuthForm mode="register" /></Suspense></div>;
}
