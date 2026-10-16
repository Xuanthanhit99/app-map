import { resolveEvidence, resolveCollection } from "./state-engine.mjs";

const MAX_ITEMS = 30;
const REQUEST_TIMEOUT_MS = 8000;
function validItem(item) {
  return item && typeof item === "object" && typeof item.id === "string" && item.id.length <= 128;
}
async function fetchCollection(url, fetcher, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { status: "error", items: [], reason: `HTTP_${response.status}` };
    const data = await response.json();
    if (!data || !["empty", "ready"].includes(data.status) || !Array.isArray(data.items) || data.items.length > MAX_ITEMS || !data.items.every(validItem)) {
      return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    }
    return resolveCollection({ status: data.status, items: data.items });
  } catch {
    return { status: "error", items: [], reason: controller.signal.aborted ? "REQUEST_ABORTED_OR_TIMEOUT" : "NETWORK_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function loadReality(baseUrl, fetcher = fetch, signal) {
  if (!baseUrl) return { status: "empty", items: [], reason: "API_NOT_CONFIGURED" };
  const result = await fetchCollection(new URL("/v1/reality/pulses", baseUrl), fetcher, signal);
  if (result.status !== "ready") return result;
  const items = result.items.map((item) => ({ ...item, evidence: resolveEvidence(item.evidence) }));
  return { status: "ready", items };
}

export async function loadDecisionPlans(baseUrl, fetcher = fetch, signal) {
  if (!baseUrl) return { status: "empty", items: [], reason: "API_NOT_CONFIGURED" };
  const result = await fetchCollection(new URL("/v1/decision/plans", baseUrl), fetcher, signal);
  if (result.status !== "ready") return result;
  const items = result.items.filter((item) =>
    typeof item.title === "string" &&
    Array.isArray(item.stops) &&
    item.stops.every((stop) => stop && typeof stop.placeId === "string") &&
    item.evidence && resolveEvidence(item.evidence).safeToAssert
  );
  return resolveCollection({ status: "ready", items });
}

/** Context is provided by a user action, never inferred from GPS or network identifiers. */
export async function queryDecisionPlans(baseUrl, context, fetcher = fetch, signal) {
  if (!baseUrl) return { status: "empty", items: [], reason: "API_NOT_CONFIGURED" };
  if (typeof context?.intent !== "string" || context.intent.trim().length < 2 ||
      context.intent.length > 160 || context.consentToUseContext !== true)
    return { status: "empty", items: [], reason: "CONSENT_AND_INTENT_REQUIRED" };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetcher(new URL("/v1/decision/plans/query", baseUrl), {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ intent: context.intent.trim(), consentToUseContext: true }),
      signal: controller.signal, cache: "no-store",
    });
    if (!response.ok) return { status: "error", items: [], reason: `HTTP_${response.status}` };
    const data = await response.json();
    if (!data || !["ready", "empty"].includes(data.status) || !Array.isArray(data.items) ||
        data.items.length > MAX_ITEMS || !data.items.every(validItem))
      return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    if (data.status === "empty") return data.items.length === 0
      ? { status: "empty", items: [], reason: typeof data.reason === "string" ? data.reason : "NO_VERIFIED_DATA" }
      : { status: "error", items: [], reason: "INVALID_CONTRACT" };
    const items = data.items.filter(item =>
      typeof item.title === "string" && Array.isArray(item.stops) &&
      item.stops.every(stop => stop && typeof stop.placeId === "string") &&
      typeof item.evidence?.provenanceId === "string" && item.evidence.provenanceId.trim() &&
      resolveEvidence(item.evidence).safeToAssert);
    return items.length ? { status: "ready", items } : { status: "empty", items: [], reason: "NO_VERIFIED_DATA" };
  } catch {
    return { status: "error", items: [], reason: controller.signal.aborted ? "REQUEST_ABORTED_OR_TIMEOUT" : "NETWORK_UNAVAILABLE" };
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
