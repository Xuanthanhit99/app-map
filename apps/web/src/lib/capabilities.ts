import { apiOrNull } from "@/lib/server-api";

export type Capabilities = { emailDelivery: boolean; passwordReset: boolean; emailVerification: boolean; federated: { google: boolean; apple: boolean }; push: boolean };
const NONE: Capabilities = { emailDelivery: false, passwordReset: false, emailVerification: false, federated: { google: false, apple: false }, push: false };

/** What the backend can actually do right now. Unknown (API unreachable) is treated as unavailable. */
export async function capabilities(): Promise<Capabilities> {
  return (await apiOrNull<Capabilities>("/v1/auth/capabilities", { revalidate: false }).catch(() => null)) ?? NONE;
}
