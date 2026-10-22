"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

const PURPOSES = [
  ["contribution_public", "Đóng góp công khai", "Cho phép gửi báo cáo và xác nhận báo cáo của người khác. Người khác chỉ thấy ô vị trí gần đúng (~150 m), không thấy tên bạn."],
  ["context_personalization", "Cá nhân hóa theo ngữ cảnh", "Dùng tùy chọn của bạn (phương tiện, nhu cầu tiếp cận, loại nơi yêu thích) khi gợi ý “Đi đâu bây giờ?”."],
  ["notifications", "Thông báo đẩy", "Gửi thông báo tới điện thoại khi khu vực theo dõi có thay đổi đáng kể."],
  ["journey_sharing", "Chia sẻ hành trình", "Cho phép tạo liên kết có thời hạn để người khác xem giờ đến dự kiến. Tắt sẽ thu hồi mọi liên kết đang mở."],
  ["analytics", "Thống kê sử dụng ẩn danh", "Giúp cải thiện sản phẩm. Không kèm vị trí hay nội dung báo cáo."],
] as const;

type Consents = { policyVersion: string; consents: Record<string, { granted: boolean; at: string }> };
type Session = { id: string; client: string; createdAt: string; current: boolean };

export default function Privacy() {
  const router = useRouter();
  const c = useApi<Consents>("/v1/me/consents");
  const s = useApi<{ items: Session[] }>("/v1/auth/sessions");
  const [msg, setMsg] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);

  async function setConsent(purpose: string, granted: boolean) {
    try { const r = await call<Consents>("/v1/me/consents", { method: "POST", body: { purpose, granted } }); c.setData(r); setMsg(granted ? "Đã bật." : "Đã tắt."); }
    catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  async function exportData() {
    const r = await fetch("/api/proxy/v1/me/export");
    if (!r.ok) { setMsg(messageFor((await r.json().catch(() => ({}))).error)); return; }
    const blob = await r.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "reality-du-lieu-cua-toi.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function deleteAccount() {
    try { await call("/v1/me/delete", { method: "POST", body: { password: pw, confirm } }); await fetch("/api/session/logout", { method: "POST" }); router.replace("/"); router.refresh(); }
    catch (e) { setDelErr(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  return (
    <section className="stack-lg" aria-labelledby="h">
      <div className="stack"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Quyền riêng tư</h1><p className="muted">Mọi quyền đều tắt cho tới khi bạn bật, và có thể tắt bất cứ lúc nào. Xem <Link href="/quyen-rieng-tu">chính sách quyền riêng tư</Link>.</p></div>
      {c.loading && !c.data ? <Loading /> : c.error ? <ErrorNote message={c.error} retry={c.reload} /> : (
        <ul className="list-plain stack">{PURPOSES.map(([k, title, desc]) => { const v = c.data?.consents[k]; return (
          <li key={k} className="panel panel-tight row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ maxWidth: "60ch" }}><strong>{title}</strong><p className="small muted">{desc}</p>{v ? <p className="xsmall muted">{v.granted ? "Bật" : "Tắt"} lúc {dateTime(v.at)}</p> : null}</div>
            <button type="button" className={`btn btn-sm ${v?.granted ? "btn-secondary" : "btn-primary"}`} aria-pressed={Boolean(v?.granted)} onClick={() => void setConsent(k, !v?.granted)}>{v?.granted ? "Tắt" : "Bật"}</button>
          </li>); })}</ul>
      )}
      {msg ? <p className="small" role="status">{msg}</p> : null}
      <div className="panel stack"><h2>Vị trí</h2><p className="small muted">Ứng dụng web chỉ hỏi vị trí khi bạn bấm nút định vị. Vị trí dùng cho gợi ý và kiểm tra hành trình không được lưu; chỉ báo cáo bạn gửi mới lưu vị trí, và chỉ hiển thị công khai ở mức ô gần đúng. Không có theo dõi nền trên web.</p></div>
      <div className="panel stack"><h2>Phiên đăng nhập</h2>
        {s.data?.items.length ? <ul className="list-plain small">{s.data.items.map((x) => <li key={x.id}>{x.client === "web" ? "Trình duyệt" : x.client} · từ {dateTime(x.createdAt)}{x.current ? " · phiên này" : ""}</li>)}</ul> : <p className="small muted">Không có phiên nào khác.</p>}
        <div><button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await call("/v1/auth/logout-all", { method: "POST" }); await fetch("/api/session/logout", { method: "POST" }); router.replace("/dang-nhap"); }}>Đăng xuất trên mọi thiết bị</button></div>
      </div>
      <div className="panel stack"><h2>Dữ liệu của bạn</h2><p className="small muted">Tải về bản sao toàn bộ dữ liệu Reality lưu về bạn (JSON).</p><div><button type="button" className="btn btn-secondary" onClick={() => void exportData()}>Tải dữ liệu của tôi</button></div></div>
      <div className="panel stack" style={{ borderColor: "rgba(255, 138, 138, 0.5)" }}><h2>Xóa tài khoản</h2><p className="small muted">Tài khoản, tùy chọn, địa điểm đã lưu, khu vực theo dõi, hành trình và thông báo sẽ bị xóa vĩnh viễn. Báo cáo đã gửi được giữ lại cho lịch sử an toàn nhưng tách khỏi bạn và xóa ghi chú.</p>
        <div><button type="button" className="btn btn-danger" onClick={() => dialog.current?.showModal()}>Xóa tài khoản…</button></div></div>
      <dialog ref={dialog} className="dialog" aria-labelledby="del-h">
        <form method="dialog" className="stack" onSubmit={(e) => { e.preventDefault(); void deleteAccount(); }}>
          <h2 id="del-h">Xóa vĩnh viễn tài khoản?</h2>
          <div className="field"><label htmlFor="del-pw">Mật khẩu</label><input id="del-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="del-c">Gõ <strong>XOA TAI KHOAN</strong> để xác nhận</label><input id="del-c" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {delErr ? <div className="notice notice-error" role="alert">{delErr}</div> : null}
          <div className="row"><button type="submit" className="btn btn-danger" disabled={confirm !== "XOA TAI KHOAN"}>Xóa vĩnh viễn</button><button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>Hủy</button></div>
        </form>
      </dialog>
    </section>
  );
}
