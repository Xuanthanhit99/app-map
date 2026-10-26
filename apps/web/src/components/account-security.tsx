"use client";
import Link from "next/link";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ResendVerification } from "@/components/recovery-forms";

type Me = { user: { email: string; emailVerified: boolean } };
type Caps = { emailDelivery: boolean };

/** Email verification state, change password. Every control is wired to a live endpoint or says why it is unavailable. */
export function AccountSecurity() {
  const me = useApi<Me>("/v1/me");
  const caps = useApi<Caps>("/v1/auth/capabilities");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) { setMsg({ ok: false, text: "Hai mật khẩu mới chưa khớp." }); return; }
    setBusy(true); setMsg(null);
    try {
      await call("/v1/auth/password", { method: "POST", body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
      form.reset();
      setMsg({ ok: true, text: "Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất." });
    } catch (err) { setMsg({ ok: false, text: messageFor(err instanceof ClientApiError ? err.code : undefined) }); }
    setBusy(false);
  }
  const user = me.data?.user;
  return (
    <section className="panel stack" aria-labelledby="sec-h">
      <h2 id="sec-h" style={{ fontSize: "var(--t-lg)" }}>Tài khoản và bảo mật</h2>
      {user ? (
        <div className="stack-sm">
          <p><span className="label">Email</span><br />{user.email} · {user.emailVerified ? <span className="badge" data-tone="ok">Đã xác minh</span> : <span className="badge" data-tone="warn">Chưa xác minh</span>}</p>
          {!user.emailVerified ? <ResendVerification available={Boolean(caps.data?.emailDelivery)} /> : null}
        </div>
      ) : me.loading ? <p className="small muted">Đang tải…</p> : <p className="small muted">Không tải được thông tin tài khoản.</p>}
      <form className="stack" onSubmit={change} aria-labelledby="pw-h">
        <h3 id="pw-h" style={{ fontSize: "var(--t-md)" }}>Đổi mật khẩu</h3>
        <div className="field"><label htmlFor="currentPassword">Mật khẩu hiện tại</label><input id="currentPassword" name="currentPassword" type="password" className="input" required maxLength={200} autoComplete="current-password" /></div>
        <div className="field"><label htmlFor="newPassword">Mật khẩu mới</label><input id="newPassword" name="newPassword" type="password" className="input" required minLength={10} maxLength={200} autoComplete="new-password" /></div>
        <div className="field"><label htmlFor="confirm">Nhập lại mật khẩu mới</label><input id="confirm" name="confirm" type="password" className="input" required minLength={10} maxLength={200} autoComplete="new-password" /></div>
        {msg ? <p className={msg.ok ? "small" : "small notice-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
        <div className="row"><button className="btn btn-secondary" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Đổi mật khẩu"}</button><Link className="small" href="/quen-mat-khau">Quên mật khẩu hiện tại?</Link></div>
      </form>
    </section>
  );
}
