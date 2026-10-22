"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { messageFor } from "@/lib/messages";

/** Only same-site relative paths are accepted as post-login redirects (no open redirect). */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/api/") ? value : "/tai-khoan";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const body = mode === "login" ? { email: f.get("email"), password: f.get("password") } : { email: f.get("email"), password: f.get("password"), displayName: f.get("displayName"), locale: "vi" };
    const r = await fetch(`/api/session/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!r) { setError(messageFor("API_UNREACHABLE")); setBusy(false); return; }
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(messageFor(d.error)); setBusy(false); return; }
    router.replace(next);
    router.refresh();
  }
  return (
    <form className="stack" onSubmit={onSubmit} noValidate={false}>
      {mode === "register" ? <div className="field"><label htmlFor="displayName">Tên hiển thị</label><input id="displayName" name="displayName" className="input" required maxLength={80} autoComplete="nickname" /></div> : null}
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="email" /></div>
      <div className="field"><label htmlFor="password">Mật khẩu</label><input id="password" name="password" type="password" className="input" required minLength={mode === "register" ? 10 : 1} maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-describedby={mode === "register" ? "pw-hint" : undefined} />
        {mode === "register" ? <span id="pw-hint" className="hint">Ít nhất 10 ký tự. Một cụm từ dễ nhớ là lựa chọn tốt.</span> : null}</div>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>
      <p className="small muted">{mode === "login" ? <>Chưa có tài khoản? <Link href={`/dang-ky?next=${encodeURIComponent(next)}`}>Tạo tài khoản</Link></> : <>Đã có tài khoản? <Link href={`/dang-nhap?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></>}</p>
      {mode === "register" ? <p className="xsmall muted">Khi tạo tài khoản, bạn đồng ý với <Link href="/dieu-khoan">Điều khoản</Link> và <Link href="/quyen-rieng-tu">Chính sách quyền riêng tư</Link>. Vị trí, chia sẻ hành trình và đóng góp công khai đều tắt cho tới khi bạn bật.</p> : null}
    </form>
  );
}
