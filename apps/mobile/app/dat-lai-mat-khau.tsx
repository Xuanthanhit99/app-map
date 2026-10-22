import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../src/infrastructure/api/client";
import { saveTokens } from "../src/infrastructure/auth/tokenStore";
import { useAuth } from "../src/infrastructure/auth/AuthContext";
import { Button, Card, Field, Notice, P, Screen } from "../src/ui/kit";

/** Opened from the reset email (universal link or reality:// scheme). The token is single-use. */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { reload } = useAuth();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 200;
  async function submit() {
    if (pw !== again) { setError("Hai mật khẩu chưa khớp."); return; }
    setBusy(true); setError(null);
    try {
      await api("/v1/auth/password/reset", { method: "POST", body: { token, newPassword: pw }, auth: false });
      await saveTokens(null); // every session was revoked server-side
      await reload();
      setDone(true);
    } catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
    finally { setBusy(false); }
  }
  return (
    <Screen title="Đặt mật khẩu mới" eyebrow="TÀI KHOẢN">
      <Card>
        {!valid ? <Notice tone="error">{messageFor("TOKEN_INVALID")}</Notice> : done ? (
          <><Notice tone="ok">Đã đặt mật khẩu mới. Mọi thiết bị đã được đăng xuất.</Notice><Button label="Đăng nhập" onPress={() => router.replace("/(tabs)/me")} /></>
        ) : (
          <>
            <P muted small>Ít nhất 10 ký tự, không chứa email.</P>
            <Field label="Mật khẩu mới" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" maxLength={200} />
            <Field label="Nhập lại mật khẩu mới" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" maxLength={200} />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button label="Đặt mật khẩu mới" onPress={() => void submit()} busy={busy} disabled={pw.length < 10 || !again} />
          </>
        )}
      </Card>
    </Screen>
  );
}
