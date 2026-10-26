import type { AppConfig } from "../config";

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown>; priority?: "default" | "high" };
export type PushResult = { to: string; ok: true } | { to: string; ok: false; error: string; permanent: boolean };

/** Push delivery. `available` drives what the product promises: no push is claimed without a provider. */
export interface PushSender {
  readonly available: boolean;
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

export class UnavailablePushSender implements PushSender {
  readonly available = false;
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    return messages.map((m) => ({ to: m.to, ok: false, error: "PUSH_UNAVAILABLE", permanent: false }));
  }
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/;

export function isExpoPushToken(token: string): boolean { return EXPO_TOKEN.test(token); }

/**
 * Expo push service. FCM/APNs credentials are held by EAS for the app; this server only needs
 * an optional access token (enhanced push security). Tickets reporting DeviceNotRegistered are
 * permanent failures: the caller disables that token.
 */
export class ExpoPushSender implements PushSender {
  readonly available = true;
  constructor(private readonly options: { accessToken?: string; transport?: typeof fetch; url?: string } = {}) {}
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const out: PushResult[] = [];
    const valid = messages.filter((m) => { if (isExpoPushToken(m.to)) return true; out.push({ to: m.to, ok: false, error: "INVALID_TOKEN", permanent: true }); return false; });
    const doFetch = this.options.transport ?? fetch;
    for (let i = 0; i < valid.length; i += 100) {
      const batch = valid.slice(i, i + 100);
      let tickets: Array<{ status: "ok" | "error"; details?: { error?: string }; message?: string }> = [];
      try {
        const res = await doFetch(this.options.url ?? EXPO_PUSH_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}) },
          body: JSON.stringify(batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {}, priority: m.priority ?? "default", sound: "default" }))),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        tickets = ((await res.json()) as { data?: typeof tickets }).data ?? [];
      } catch (e) {
        for (const m of batch) out.push({ to: m.to, ok: false, error: `TRANSPORT:${(e as Error).message.slice(0, 40)}`, permanent: false });
        continue;
      }
      batch.forEach((m, idx) => {
        const t = tickets[idx];
        if (t?.status === "ok") out.push({ to: m.to, ok: true });
        else {
          const error = t?.details?.error ?? "UNKNOWN";
          out.push({ to: m.to, ok: false, error, permanent: error === "DeviceNotRegistered" });
        }
      });
    }
    return out;
  }
}

export function createPushSender(config: AppConfig, transport?: typeof fetch): PushSender {
  if (config.push.provider === "expo") return new ExpoPushSender({ ...(config.push.expoAccessToken ? { accessToken: config.push.expoAccessToken } : {}), ...(transport ? { transport } : {}) });
  return new UnavailablePushSender();
}
