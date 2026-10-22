import type { Metadata } from "next";
import { VerifyEmail } from "@/components/recovery-forms";

export const metadata: Metadata = { title: "Xác minh email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth-card stack">
      <h1 style={{ fontSize: "var(--t-2xl)" }}>Xác minh email</h1>
      <VerifyEmail token={typeof token === "string" && token.length >= 20 && token.length <= 200 ? token : null} />
    </div>
  );
}
