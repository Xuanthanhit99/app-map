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
