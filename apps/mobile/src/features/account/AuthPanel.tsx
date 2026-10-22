import { useState } from "react";
import { View } from "react-native";
import { messageFor } from "@core/i18n/error-messages";
import { ApiError } from "../../infrastructure/api/client";
import { useAuth } from "../../infrastructure/auth/AuthContext";
import { Button, Card, Field, H, Notice, P } from "../../ui/kit";

export function AuthPanel() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { if (mode === "login") await login(email.trim(), password); else await register(email.trim(), password, name.trim()); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <H>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</H>
      <P muted small>Tài khoản giúp bạn gửi báo cáo, theo dõi khu vực và lưu hành trình. Phiên đăng nhập được giữ trong kho khóa bảo mật của thiết bị.</P>
      {mode === "register" ? <Field label="Tên hiển thị" value={name} onChangeText={setName} maxLength={80} autoComplete="name" /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={254} />
      <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "login" ? "password" : "new-password"} maxLength={200} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label={mode === "login" ? "Đăng nhập" : "Tạo tài khoản"} onPress={() => void submit()} busy={busy} disabled={!email || !password || (mode === "register" && !name)} />
      <View><Button kind="quiet" label={mode === "login" ? "Chưa có tài khoản? Tạo tài khoản" : "Đã có tài khoản? Đăng nhập"} onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} /></View>
    </Card>
  );
}
