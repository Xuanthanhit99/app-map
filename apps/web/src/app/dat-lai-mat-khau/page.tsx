import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/recovery-forms";

export const metadata: Metadata = { title: "Đặt lại mật khẩu", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth-card stack">
      <h1 style={{ fontSize: "var(--t-2xl)" }}>Đặt mật khẩu mới</h1>
      <ResetPasswordForm token={typeof token === "string" && token.length >= 20 && token.length <= 200 ? token : null} />
    </div>
  );
}
