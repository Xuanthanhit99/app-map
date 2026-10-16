export type ApiCollection<T> =
  | { status: "ready"; items: T[] }
  | { status: "empty"; items: []; reason: string }
  | { status: "error"; items: []; reason: string };

type ApiItem = { id: string; evidence?: { truth?: string; source?: string; observedAt?: string } };
const MAX_ITEMS = 30;

export async function getRealityDecisionCollection(
  baseUrl: string | undefined,
  resource: "reality" | "decision",
  fetcher: typeof fetch = fetch,
): Promise<ApiCollection<ApiItem>> {
  if (!baseUrl) return { status: "empty", items: [], reason: "API_NOT_CONFIGURED" };
  const path = resource === "reality" ? "/v1/reality/pulses" : "/v1/decision/plans";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(new URL(path, baseUrl).toString(), {
      method: "GET", headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) return { status: "error", items: [], reason: `HTTP_${response.status}` };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    const data = body as Record<string, unknown>;
    if (!Array.isArray(data.items) || data.items.length > MAX_ITEMS ||
      !data.items.every((item: unknown) => item && typeof item === "object" && typeof (item as ApiItem).id === "string")) {
      return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    }
    if (data.status === "empty" && data.items.length === 0) {
      return { status: "empty", items: [], reason: typeof data.reason === "string" ? data.reason : "NO_VERIFIED_DATA" };
    }
    if (data.status !== "ready") return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    // A ready payload is not a license to assert LIVE; evidence validation occurs in State Engine.
    return { status: "ready", items: data.items as ApiItem[] };
  } catch {
    return { status: "error", items: [], reason: "NETWORK_OR_TIMEOUT" };
  } finally {
    clearTimeout(timer);
  }
}

/** Explicit intent and consent. No device location, IP inference or implicit personal context. */
export async function queryDecisionPlans(
  baseUrl: string | undefined,
  context: { intent: string; consentToUseContext: boolean },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ApiCollection<ApiItem>> {
  if (!baseUrl) return { status: "empty", items: [], reason: "API_NOT_CONFIGURED" };
  if (typeof context.intent !== "string" || context.intent.trim().length < 2 || context.intent.length > 160 ||
      context.consentToUseContext !== true) return { status: "empty", items: [], reason: "CONSENT_AND_INTENT_REQUIRED" };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetcher(new URL("/v1/decision/plans/query", baseUrl).toString(), {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ intent: context.intent.trim(), consentToUseContext: true }), signal: controller.signal,
    });
    if (!response.ok) return { status: "error", items: [], reason: `HTTP_${response.status}` };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    const data = body as Record<string, unknown>;
    if (!Array.isArray(data.items) || data.items.length > MAX_ITEMS ||
        !data.items.every((item: unknown) => item && typeof item === "object" &&
          typeof (item as ApiItem).id === "string" && (item as ApiItem).id.length > 0)) {
      return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    }
    if (data.status === "empty" && data.items.length === 0)
      return { status: "empty", items: [], reason: typeof data.reason === "string" ? data.reason : "NO_VERIFIED_DATA" };
    if (data.status !== "ready") return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    const verified = data.items.filter((item: ApiItem) => {
      const e = item.evidence;
      return e?.truth === "KNOWN" && typeof e.source === "string" && e.source.trim().length > 0 &&
        typeof e.observedAt === "string" && Number.isFinite(Date.parse(e.observedAt)) &&
        Date.parse(e.observedAt) <= Date.now() && Date.now() - Date.parse(e.observedAt) <= 300_000 &&
        typeof (e as Record<string, unknown>).provenanceId === "string" &&
        Boolean((e as Record<string, unknown>).provenanceId);
    });
    return verified.length ? { status: "ready", items: verified } : { status: "empty", items: [], reason: "NO_VERIFIED_DATA" };
  } catch {
    return { status: "error", items: [], reason: controller.signal.aborted ? "REQUEST_ABORTED_OR_TIMEOUT" : "NETWORK_UNAVAILABLE" };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
