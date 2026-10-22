import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../infrastructure/api/client";
import { useCapabilities } from "../../infrastructure/api/capabilities";
import { useAuth } from "../../infrastructure/auth/AuthContext";
import { appleAvailable, appleIdToken, googleConfiguredForPlatform, useGoogleIdToken } from "../../infrastructure/auth/nativeOAuth";
import { Button, Card, Field, H, Notice, P } from "../../ui/kit";

type Mode = "login" | "register" | "forgot";

export function AuthPanel() {
  const { login, register, federated } = useAuth();
  const { caps, loaded } = useCapabilities();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  useEffect(() => { void appleAvailable().then(setApple); }, []);
  const fail = (e: unknown) => setError(messageFor(e instanceof ApiError ? e.code : undefined));
  const onGoogle = useCallback((idToken: string, nonce: string) => {
    setBusy(true); setError(null);
    federated("google", idToken, nonce).catch(fail).finally(() => setBusy(false));
  }, [federated]);
  const google = useGoogleIdToken(onGoogle);
  const showGoogle = caps.federated.google && googleConfiguredForPlatform();
  const showApple = caps.federated.apple && apple;

  async function submit() {
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else if (mode === "register") await register(email.trim(), password, name.trim());
      else {
        await api("/v1/auth/password/forgot", { method: "POST", body: { email: email.trim() }, auth: false });
        setInfo("Nếu email này có tài khoản, một liên kết đặt lại mật khẩu đã được gửi tới đó (hiệu lực 30 phút). Mở liên kết trên điện thoại này hoặc trên web.");
      }
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function onApple() {
    setBusy(true); setError(null);
    try { const r = await appleIdToken(); if (r) await federated("apple", r.idToken, r.nonce, r.name); }
    catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  const switchTo = (m: Mode) => { setMode(m); setError(null); setInfo(null); };
  return (
    <Card>
      <H>{mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : "Quên mật khẩu"}</H>
      {mode === "forgot" ? (
        loaded && !caps.passwordReset
          ? <Notice tone="warn">Đặt lại mật khẩu qua email chưa khả dụng vì hệ thống gửi email chưa được cấu hình.</Notice>
          : <P muted small>Nhập email của tài khoản. Chúng tôi sẽ gửi liên kết đặt mật khẩu mới.</P>
      ) : <P muted small>Tài khoản giúp bạn gửi báo cáo, theo dõi khu vực và lưu hành trình. Phiên đăng nhập được giữ trong kho khóa bảo mật của thiết bị.</P>}
      {mode === "register" ? <Field label="Tên hiển thị" value={name} onChangeText={setName} maxLength={80} autoComplete="name" /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={254} />
      {mode !== "forgot" ? <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "login" ? "password" : "new-password"} maxLength={200} /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {info ? <Notice tone="ok">{info}</Notice> : null}
      <Button label={mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : "Gửi liên kết đặt lại"} onPress={() => void submit()} busy={busy}
        disabled={!email || (mode !== "forgot" && !password) || (mode === "register" && !name) || (mode === "forgot" && loaded && !caps.passwordReset)} />
      {mode !== "forgot" && (showGoogle || showApple) ? (
        <View style={{ gap: 8 }}>
          <P muted small>Hoặc</P>
          {showApple ? <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE} cornerRadius={10} style={{ height: 46 }} onPress={() => void onApple()} /> : null}
          {showGoogle ? <Button kind="secondary" label="Tiếp tục với Google" disabled={!google.ready || busy} onPress={() => void google.prompt()} /> : null}
        </View>
      ) : null}
      <View>
        {mode === "login" ? <Button kind="quiet" label="Quên mật khẩu?" onPress={() => switchTo("forgot")} /> : null}
        <Button kind="quiet" label={mode === "register" ? "Đã có tài khoản? Đăng nhập" : mode === "forgot" ? "Quay lại đăng nhập" : "Chưa có tài khoản? Tạo tài khoản"} onPress={() => switchTo(mode === "login" ? "register" : "login")} />
      </View>
    </Card>
  );
}
