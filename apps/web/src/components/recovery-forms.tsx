"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/messages";

async function post(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(`/api/proxy${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).catch(() => null);
  if (!r) return { ok: false, status: 0, data: { error: "API_UNREACHABLE" } };
  return { ok: r.ok, status: r.status, data: r.status === 204 ? {} : await r.json().catch(() => ({})) };
}

/** Remove the single-use token from the address bar and history once it has been read. */
function useTokenFromUrl(initial: string | null): string | null {
  const [token] = useState(initial);
  useEffect(() => { if (initial) window.history.replaceState(null, "", window.location.pathname); }, [initial]);
  return token;
}

export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy"); setError(null);
    const r = await post("/v1/auth/password/forgot", { email: new FormData(e.currentTarget).get("email") });
    if (r.ok) setState("sent");
    else { setError(messageFor(String(r.data.error ?? ""))); setState("idle"); }
  }
  if (state === "sent") {
    return <div className="notice" role="status">Nếu email này có tài khoản REALITY, một liên kết đặt lại mật khẩu đã được gửi tới đó. Liên kết có hiệu lực 30 phút và chỉ dùng được một lần. Hãy kiểm tra cả thư rác.</div>;
  }
  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="field"><label htmlFor="email">Email tài khoản</label><input id="email" name="email" type="email" className="input" required maxLength={254} autoComplete="email" /></div>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      <button className="btn btn-primary btn-lg" type="submit" disabled={state === "busy"}>{state === "busy" ? "Đang gửi…" : "Gửi liên kết đặt lại"}</button>
      <p className="small muted"><Link href="/dang-nhap">Quay lại đăng nhập</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token: initial }: { token: string | null }) {
  const token = useTokenFromUrl(initial);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!token) return <div className="notice notice-error" role="alert">{messageFor("TOKEN_INVALID")} <Link href="/quen-mat-khau">Yêu cầu liên kết mới</Link></div>;
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("newPassword") !== f.get("confirm")) { setError("Hai mật khẩu chưa khớp."); return; }
    setState("busy"); setError(null);
    const r = await post("/v1/auth/password/reset", { token, newPassword: f.get("newPassword") });
    if (r.ok) {
      // Every session was revoked server-side; clear this browser's cookies too.
      await fetch("/api/session/logout", { method: "POST" }).catch(() => null);
      setState("done");
    } else { setError(messageFor(String(r.data.error ?? ""))); setState("idle"); }
  }
  if (state === "done") return <div className="notice" role="status">Đã đặt mật khẩu mới. Mọi thiết bị đã được đăng xuất. <Link href="/dang-nhap">Đăng nhập</Link></div>;
  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="field"><label htmlFor="newPassword">Mật khẩu mới</label><input id="newPassword" name="newPassword" type="password" className="input" required minLength={10} maxLength={200} autoComplete="new-password" aria-describedby="pw-hint" /><span id="pw-hint" className="hint">Ít nhất 10 ký tự, không chứa email.</span></div>
      <div className="field"><label htmlFor="confirm">Nhập lại mật khẩu mới</label><input id="confirm" name="confirm" type="password" className="input" required minLength={10} maxLength={200} autoComplete="new-password" /></div>
      {error ? <div className="notice notice-error" role="alert">{error}{error === messageFor("TOKEN_EXPIRED") || error === messageFor("TOKEN_INVALID") ? <> <Link href="/quen-mat-khau">Yêu cầu liên kết mới</Link></> : null}</div> : null}
      <button className="btn btn-primary btn-lg" type="submit" disabled={state === "busy"}>{state === "busy" ? "Đang lưu…" : "Đặt mật khẩu mới"}</button>
    </form>
  );
}

export function VerifyEmail({ token: initial }: { token: string | null }) {
  const token = useTokenFromUrl(initial);
  const [state, setState] = useState<"busy" | "ok" | "error">(token ? "busy" : "error");
  const [error, setError] = useState<string>(token ? "" : messageFor("TOKEN_INVALID"));
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void post("/v1/auth/email/verify/confirm", { token }).then((r) => {
      if (r.ok) setState("ok"); else { setError(messageFor(String(r.data.error ?? ""))); setState("error"); }
    });
  }, [token]);
  if (state === "busy") return <p role="status">Đang xác minh…</p>;
  if (state === "ok") return <div className="notice" role="status">Email đã được xác minh. <Link href="/tai-khoan">Về tài khoản</Link></div>;
  return <div className="notice notice-error" role="alert">{error} <Link href="/tai-khoan/cai-dat">Gửi lại email xác minh</Link></div>;
}

export function ResendVerification({ available }: { available: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "already">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!available) return <p className="small muted">Chưa thể gửi email xác minh: hệ thống gửi email chưa được cấu hình.</p>;
  async function send() {
    setState("busy"); setError(null);
    const r = await post("/v1/auth/email/verify/request");
    if (r.ok) setState(r.data.status === "ALREADY_VERIFIED" ? "already" : "sent");
    else { setError(messageFor(String(r.data.error ?? ""))); setState("idle"); }
  }
  if (state === "sent") return <p className="small" role="status">Đã gửi email xác minh. Liên kết có hiệu lực 24 giờ.</p>;
  if (state === "already") return <p className="small" role="status">Email đã được xác minh.</p>;
  return <div className="stack-sm"><button type="button" className="btn btn-secondary" onClick={send} disabled={state === "busy"}>{state === "busy" ? "Đang gửi…" : "Gửi email xác minh"}</button>{error ? <p className="small notice-error" role="alert">{error}</p> : null}</div>;
}
