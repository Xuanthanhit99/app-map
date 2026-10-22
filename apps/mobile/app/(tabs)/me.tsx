import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../src/infrastructure/api/client";
import { useAuth } from "../../src/infrastructure/auth/AuthContext";
import { useLocationPreference } from "../../src/infrastructure/location/LocationPreferenceContext";
import { AuthPanel } from "../../src/features/account/AuthPanel";
import { Button, Card, Field, H, Notice, P, Screen } from "../../src/ui/kit";

const PURPOSES = [
  ["contribution_public", "Đóng góp công khai", "Gửi và xác nhận báo cáo. Người khác chỉ thấy ô vị trí ~150 m, không thấy tên bạn."],
  ["context_personalization", "Cá nhân hóa gợi ý", "Dùng tùy chọn của bạn khi gợi ý “Đi đâu bây giờ?”."],
  ["journey_sharing", "Chia sẻ hành trình", "Cho phép tạo liên kết giờ đến dự kiến có thời hạn. Tắt sẽ thu hồi mọi liên kết."],
  ["notifications", "Thông báo đẩy", "Gửi thông báo khi khu vực theo dõi có thay đổi đáng kể."],
] as const;
type Consents = Record<string, { granted: boolean }>;

export default function MeTab() {
  const { user, ready, logout } = useAuth();
  const { choice, hydrated, setChoice } = useLocationPreference();
  const [consents, setConsents] = useState<Consents>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const load = useCallback(async () => { if (user) setConsents((await api<{ consents: Consents }>("/v1/me/consents").catch(() => ({ consents: {} }))).consents); }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function toggle(purpose: string, granted: boolean) {
    try { setConsents((await api<{ consents: Consents }>("/v1/me/consents", { method: "POST", body: { purpose, granted } })).consents); }
    catch (e) { setMsg(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }
  async function deleteAccount() {
    try { await api("/v1/me/delete", { method: "POST", body: { password: pw, confirm } }); await logout(); setMsg("Tài khoản đã được xóa vĩnh viễn."); }
    catch (e) { setMsg(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }
  const web = process.env.EXPO_PUBLIC_WEB_URL;
  return (
    <Screen title="Tôi" eyebrow="TÀI KHOẢN · QUYỀN RIÊNG TƯ">
      {!ready ? <P muted>Đang tải phiên đăng nhập…</P> : user ? (
        <Card><H>{user.displayName}</H><P muted small>{user.email}</P><Button kind="secondary" label="Đăng xuất" onPress={() => void logout()} /></Card>
      ) : <AuthPanel />}
      <Card>
        <H>Định vị</H>
        <P muted small>Ứng dụng chỉ dùng vị trí khi đang mở (không theo dõi nền). Tắt trong ứng dụng không thay đổi quyền hệ thống đã cấp.</P>
        <P small>Lựa chọn hiện tại: {!hydrated ? "đang tải" : choice === "ENABLE" ? "Bật định vị" : choice === "SKIP" ? "Không bật" : "Chưa lựa chọn"}</P>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind={choice === "ENABLE" ? "primary" : "secondary"} label="Bật định vị" onPress={() => setChoice("ENABLE")} disabled={!hydrated} /></View>
          <View style={{ flex: 1 }}><Button kind={choice === "SKIP" ? "primary" : "secondary"} label="Không bật" onPress={() => setChoice("SKIP")} disabled={!hydrated} /></View>
        </View>
        {Platform.OS !== "web" ? <Button kind="quiet" label={Platform.OS === "ios" ? "Quản lý quyền trong Cài đặt iOS" : "Quản lý quyền trong Cài đặt Android"} onPress={() => void Linking.openSettings()} /> : null}
      </Card>
      {user ? (
        <>
          <Card>
            <H>Quyền riêng tư</H>
            {PURPOSES.map(([k, title, desc]) => (
              <View key={k} style={{ gap: 6, paddingVertical: 6 }}>
                <P>{title}</P><P muted small>{desc}</P>
                <Button kind={consents[k]?.granted ? "secondary" : "primary"} label={consents[k]?.granted ? "Tắt" : "Bật"} onPress={() => void toggle(k, !consents[k]?.granted)} />
              </View>
            ))}
          </Card>
          {web ? <Card><H>Dữ liệu của bạn</H><P muted small>Tải bản sao toàn bộ dữ liệu trên trang web Reality (đăng nhập cùng tài khoản).</P><Button kind="secondary" label="Mở trang xuất dữ liệu" onPress={() => void Linking.openURL(`${web}/tai-khoan/quyen-rieng-tu`)} /></Card> : null}
          <Card>
            <H>Xóa tài khoản</H>
            <P muted small>Xóa vĩnh viễn tài khoản và dữ liệu cá nhân. Báo cáo đã gửi được giữ cho lịch sử an toàn nhưng tách khỏi bạn.</P>
            {!deleting ? <Button kind="danger" label="Xóa tài khoản…" onPress={() => setDeleting(true)} /> : (
              <View style={{ gap: 10 }}>
                <Field label="Mật khẩu" value={pw} onChangeText={setPw} secureTextEntry />
                <Field label="Gõ XOA TAI KHOAN để xác nhận" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
                <Button kind="danger" label="Xóa vĩnh viễn" disabled={confirm !== "XOA TAI KHOAN"} onPress={() => void deleteAccount()} />
                <Button kind="quiet" label="Hủy" onPress={() => setDeleting(false)} />
              </View>
            )}
          </Card>
        </>
      ) : null}
      {msg ? <Notice>{msg}</Notice> : null}
    </Screen>
  );
}
