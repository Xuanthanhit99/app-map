import { resolveEvidence, resolveCollection } from "./state-engine.mjs";

const MAX_ITEMS = 30;
function validItem(item) {
  return item && typeof item === "object" && typeof item.id === "string" && item.id.length <= 128;
}
async function fetchCollection(url, fetcher, signal) {
  try {
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal, cache: "no-store" });
    if (!response.ok) return { status: "error", items: [], reason: `HTTP_${response.status}` };
    const data = await response.json();
    if (!data || !["empty", "ready"].includes(data.status) || !Array.isArray(data.items) || data.items.length > MAX_ITEMS || !data.items.every(validItem)) {
      return { status: "error", items: [], reason: "INVALID_CONTRACT" };
    }
    return resolveCollection({ status: data.status, items: data.items });
  } catch {
    return { status: "error", items: [], reason: "NETWORK_UNAVAILABLE" };
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
