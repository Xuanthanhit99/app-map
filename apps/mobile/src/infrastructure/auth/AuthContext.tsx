import { Platform } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setSignedOutHandler, signIn, signOut, type SessionUser } from "../api/client";
import { loadTokens } from "./tokenStore";
import { unregisterPush } from "../push/pushRegistration";

type Auth = { user: SessionUser | null; ready: boolean; login(email: string, password: string): Promise<void>; register(email: string, password: string, displayName: string): Promise<void>; federated(provider: "google" | "apple", idToken: string, nonce: string, displayName?: string | null): Promise<void>; logout(): Promise<void>; reload(): Promise<void> };
const CLIENT = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    if (!(await loadTokens())) { setUser(null); setReady(true); return; }
    try { setUser((await api<{ user: SessionUser }>("/v1/me")).user); } catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { setSignedOutHandler(() => setUser(null)); void reload(); return () => setSignedOutHandler(null); }, [reload]);
  const value = useMemo<Auth>(() => ({
    user, ready, reload,
    async login(email, password) { setUser(await signIn("/v1/auth/login", { email, password, client: CLIENT })); },
    async register(email, password, displayName) { setUser(await signIn("/v1/auth/register", { email, password, displayName, locale: "vi", client: CLIENT })); },
    async federated(provider, idToken, nonce, displayName) { setUser(await signIn("/v1/auth/federated", { provider, idToken, nonce, client: CLIENT, ...(displayName ? { displayName } : {}) })); },
    async logout() { await unregisterPush(); await signOut(); setUser(null); },
  }), [user, ready, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
