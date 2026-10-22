import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/recovery-forms";
import { capabilities } from "@/lib/capabilities";

export const metadata: Metadata = { title: "Quên mật khẩu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPassword() {
  const caps = await capabilities();
  return (
    <div className="auth-card stack">
      <h1 style={{ fontSize: "var(--t-2xl)" }}>Quên mật khẩu</h1>
      {caps.passwordReset ? (
        <><p className="muted">Nhập email của tài khoản. Chúng tôi sẽ gửi một liên kết để đặt mật khẩu mới.</p><ForgotPasswordForm /></>
      ) : (
        <div className="notice" role="status">Đặt lại mật khẩu qua email chưa khả dụng vì hệ thống gửi email chưa được cấu hình. <Link href="/tro-giup">Xem trợ giúp</Link></div>
      )}
    </div>
  );
}
