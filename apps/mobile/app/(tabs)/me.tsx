import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import * as Location from "expo-location";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../src/infrastructure/api/client";
import { useCapabilities } from "../../src/infrastructure/api/capabilities";
import { useAuth } from "../../src/infrastructure/auth/AuthContext";
import { useLocationPreference } from "../../src/infrastructure/location/LocationPreferenceContext";
import { registerForPush, unregisterPush, type PushStatus } from "../../src/infrastructure/push/pushRegistration";
import { AuthPanel } from "../../src/features/account/AuthPanel";
import { Button, Card, Field, H, Notice, P, Screen } from "../../src/ui/kit";

const PURPOSES = [
  ["contribution_public", "Đóng góp công khai", "Gửi và xác nhận báo cáo. Người khác chỉ thấy ô vị trí ~150 m, không thấy tên bạn."],
  ["context_personalization", "Cá nhân hóa gợi ý", "Dùng tùy chọn của bạn khi gợi ý “Đi đâu bây giờ?”."],
  ["journey_sharing", "Chia sẻ hành trình", "Cho phép tạo liên kết giờ đến dự kiến có thời hạn. Tắt sẽ thu hồi mọi liên kết."],
  ["notifications", "Thông báo đẩy", "Gửi thông báo khi khu vực theo dõi có thay đổi đáng kể. Thông báo luôn có trong mục Theo dõi kể cả khi tắt."],
] as const;
type Consents = Record<string, { granted: boolean }>;
const PUSH_TEXT: Record<PushStatus, string> = {
  REGISTERED: "Thiết bị này sẽ nhận thông báo đẩy.",
  DENIED: "Bạn đã từ chối quyền thông báo của hệ thống. Bật lại trong Cài đặt nếu muốn nhận thông báo đẩy.",
  UNSUPPORTED: "Bản ứng dụng này chưa được cấu hình thông báo đẩy (hoặc đang chạy trên trình giả lập). Thông báo vẫn có trong ứng dụng.",
  FAILED: "Chưa đăng ký được thông báo đẩy. Hãy thử lại sau.",
};
const PERM_TEXT: Record<string, string> = { granted: "Đã cho phép (chỉ khi đang dùng ứng dụng)", denied: "Đã từ chối", undetermined: "Chưa hỏi" };

export default function MeTab() {
  const { user, ready, logout, reload } = useAuth();
  const { caps } = useCapabilities();
  const { choice, hydrated, setChoice } = useLocationPreference();
  const [consents, setConsents] = useState<Consents>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [perm, setPerm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fail = (e: unknown) => setMsg({ tone: "error", text: messageFor(e instanceof ApiError ? e.code : undefined) });

  const load = useCallback(async () => { if (user) setConsents((await api<{ consents: Consents }>("/v1/me/consents").catch(() => ({ consents: {} }))).consents); }, [user]);
  useEffect(() => { void load(); }, [load]);
  const readPerm = useCallback(() => { if (Platform.OS !== "web") void Location.getForegroundPermissionsAsync().then((p) => setPerm(p.status)).catch(() => setPerm(null)); }, []);
  useEffect(() => { readPerm(); const sub = AppState.addEventListener("change", (s) => { if (s === "active") readPerm(); }); return () => sub.remove(); }, [readPerm]);

  async function toggle(purpose: string, granted: boolean) {
    try {
      setConsents((await api<{ consents: Consents }>("/v1/me/consents", { method: "POST", body: { purpose, granted } })).consents);
      if (purpose === "notifications") {
        if (granted) setPush(caps.push ? await registerForPush() : "UNSUPPORTED");
        else { await unregisterPush(); setPush(null); }
      }
    } catch (e) { fail(e); }
  }
  async function resend() {
    setBusy("verify");
    try { const r = await api<{ status: string }>("/v1/auth/email/verify/request", { method: "POST" }); setMsg({ tone: "ok", text: r.status === "ALREADY_VERIFIED" ? "Email đã được xác minh." : "Đã gửi email xác minh (hiệu lực 24 giờ)." }); await reload(); }
    catch (e) { fail(e); } finally { setBusy(null); }
  }
  async function changePassword() {
    setBusy("pw");
    try { await api("/v1/auth/password", { method: "POST", body: { currentPassword: cur, newPassword: next } }); setCur(""); setNext(""); setMsg({ tone: "ok", text: "Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất." }); }
    catch (e) { fail(e); } finally { setBusy(null); }
  }
  async function exportData() {
    setBusy("export");
    try {
      const data = await api<unknown>("/v1/me/export");
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) { setMsg({ tone: "info", text: "Thiết bị này không hỗ trợ chia sẻ tệp. Hãy tải bản sao trên trang web Reality." }); return; }
      const file = new File(Paths.cache, `reality-du-lieu-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Lưu bản sao dữ liệu" });
    } catch (e) { fail(e); } finally { setBusy(null); }
  }
  async function deleteAccount() {
    setBusy("delete");
    try { await api("/v1/me/delete", { method: "POST", body: { password: pw, confirm } }); await logout(); setMsg({ tone: "ok", text: "Tài khoản đã được xóa vĩnh viễn." }); }
    catch (e) { fail(e); } finally { setBusy(null); }
  }

  return (
    <Screen title="Tôi" eyebrow="TÀI KHOẢN · QUYỀN RIÊNG TƯ">
      {!ready ? <P muted>Đang tải phiên đăng nhập…</P> : user ? (
        <Card>
          <H>{user.displayName}</H>
          <P muted small>{user.email} · {user.emailVerified ? "Đã xác minh" : "Chưa xác minh"}</P>
          {!user.emailVerified ? (caps.emailVerification
            ? <Button kind="secondary" label="Gửi email xác minh" busy={busy === "verify"} onPress={() => void resend()} />
            : <P muted small>Chưa thể gửi email xác minh: hệ thống gửi email chưa được cấu hình.</P>) : null}
          <Button kind="secondary" label="Đăng xuất" onPress={() => void logout()} />
        </Card>
      ) : <AuthPanel />}
      <Card>
        <H>Định vị</H>
        <P muted small>Reality chỉ dùng vị trí khi ứng dụng đang mở. Ứng dụng không yêu cầu và không dùng vị trí nền.</P>
        <P small>Quyền hệ thống: {Platform.OS === "web" ? "do trình duyệt quản lý" : perm ? PERM_TEXT[perm] ?? perm : "đang kiểm tra"}</P>
        <P small>Vị trí nền: không sử dụng</P>
        <P small>Lựa chọn trong ứng dụng: {!hydrated ? "đang tải" : choice === "ENABLE" ? "Bật định vị" : choice === "SKIP" ? "Không bật" : "Chưa lựa chọn"}</P>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind={choice === "ENABLE" ? "primary" : "secondary"} label="Bật định vị" onPress={() => setChoice("ENABLE")} disabled={!hydrated} /></View>
          <View style={{ flex: 1 }}><Button kind={choice === "SKIP" ? "primary" : "secondary"} label="Không bật" onPress={() => setChoice("SKIP")} disabled={!hydrated} /></View>
        </View>
        {Platform.OS !== "web" ? <><P muted small>Để thu hồi quyền đã cấp, hãy tắt trong Cài đặt hệ thống. “Không bật” chỉ dừng ứng dụng dùng vị trí, không thu hồi quyền.</P><Button kind="quiet" label={Platform.OS === "ios" ? "Mở Cài đặt iOS" : "Mở Cài đặt Android"} onPress={() => void Linking.openSettings()} /></> : null}
      </Card>
      {user ? (
        <>
          <Card>
            <H>Quyền riêng tư</H>
            {PURPOSES.map(([k, title, desc]) => (
              <View key={k} style={{ gap: 6, paddingVertical: 6 }}>
                <P>{title}</P><P muted small>{desc}</P>
                {k === "notifications" && consents[k]?.granted && push ? <P small>{PUSH_TEXT[push]}</P> : null}
                {k === "notifications" && !caps.push ? <P muted small>Thông báo đẩy chưa được cấu hình trên máy chủ.</P> : null}
                <Button kind={consents[k]?.granted ? "secondary" : "primary"} label={consents[k]?.granted ? "Tắt" : "Bật"} onPress={() => void toggle(k, !consents[k]?.granted)} />
              </View>
            ))}
          </Card>
          <Card>
            <H>Đổi mật khẩu</H>
            <Field label="Mật khẩu hiện tại" value={cur} onChangeText={setCur} secureTextEntry autoComplete="password" maxLength={200} />
            <Field label="Mật khẩu mới (ít nhất 10 ký tự)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" maxLength={200} />
            <Button kind="secondary" label="Đổi mật khẩu" busy={busy === "pw"} disabled={!cur || next.length < 10} onPress={() => void changePassword()} />
          </Card>
          <Card>
            <H>Dữ liệu của bạn</H>
            <P muted small>Tải bản sao toàn bộ dữ liệu của bạn (JSON): hồ sơ, đồng ý, báo cáo, hành trình, địa điểm đã lưu.</P>
            <Button kind="secondary" label="Xuất dữ liệu" busy={busy === "export"} onPress={() => void exportData()} />
          </Card>
          <Card>
            <H>Xóa tài khoản</H>
            <P muted small>Xóa vĩnh viễn tài khoản và dữ liệu cá nhân. Báo cáo đã gửi được giữ cho lịch sử an toàn nhưng tách khỏi bạn.</P>
            {!deleting ? <Button kind="danger" label="Xóa tài khoản…" onPress={() => setDeleting(true)} /> : (
              <View style={{ gap: 10 }}>
                <Field label="Mật khẩu (bỏ trống nếu đăng nhập bằng Google/Apple)" value={pw} onChangeText={setPw} secureTextEntry />
                <Field label="Gõ XOA TAI KHOAN để xác nhận" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
                <Button kind="danger" label="Xóa vĩnh viễn" busy={busy === "delete"} disabled={confirm !== "XOA TAI KHOAN"} onPress={() => void deleteAccount()} />
                <Button kind="quiet" label="Hủy" onPress={() => setDeleting(false)} />
              </View>
            )}
          </Card>
        </>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </Screen>
  );
}
