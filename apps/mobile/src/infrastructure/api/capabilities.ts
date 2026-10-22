import { useEffect, useState } from "react";
import { api } from "./client";

export type Capabilities = { emailDelivery: boolean; passwordReset: boolean; emailVerification: boolean; federated: { google: boolean; apple: boolean }; push: boolean };
export const NO_CAPABILITIES: Capabilities = { emailDelivery: false, passwordReset: false, emailVerification: false, federated: { google: false, apple: false }, push: false };

/** What the backend can actually do. Unknown (offline / not configured) is treated as unavailable, never assumed. */
export function useCapabilities(): { caps: Capabilities; loaded: boolean } {
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    api<Capabilities>("/v1/auth/capabilities", { auth: false }).then((c) => { if (alive) setCaps(c); }).catch(() => undefined).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  return { caps, loaded };
}
