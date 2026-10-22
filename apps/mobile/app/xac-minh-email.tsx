import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../src/infrastructure/api/client";
import { useAuth } from "../src/infrastructure/auth/AuthContext";
import { Button, Card, Notice, P, Screen } from "../src/ui/kit";

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { reload } = useAuth();
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 200;
  const [state, setState] = useState<"busy" | "ok" | "error">(valid ? "busy" : "error");
  const [error, setError] = useState(valid ? "" : messageFor("TOKEN_INVALID"));
  const started = useRef(false);
  useEffect(() => {
    if (!valid || started.current) return;
    started.current = true;
    api("/v1/auth/email/verify/confirm", { method: "POST", body: { token }, auth: false })
      .then(async () => { setState("ok"); await reload(); })
      .catch((e) => { setError(messageFor(e instanceof ApiError ? e.code : undefined)); setState("error"); });
  }, [valid, token, reload]);
  return (
    <Screen title="Xác minh email" eyebrow="TÀI KHOẢN">
      <Card>
        {state === "busy" ? <P>Đang xác minh…</P> : state === "ok" ? <Notice tone="ok">Email đã được xác minh.</Notice> : <Notice tone="error">{error}</Notice>}
        <Button kind="secondary" label="Về tài khoản" onPress={() => router.replace("/(tabs)/me")} />
      </Card>
    </Screen>
  );
}
