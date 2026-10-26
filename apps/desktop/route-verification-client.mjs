const TIMEOUT_MS = 8000;
function coordinate(value) {
  return Array.isArray(value) && value.length === 2 &&
    Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

/** Does not access geolocation. Caller must explicitly provide the origin. */
export async function verifySelectedPlanRoute({ baseUrl, plan, origin, destination, mode = "DRIVING", fetcher = fetch, signal }) {
  if (!baseUrl) return { status: "unavailable", reason: "API_NOT_CONFIGURED" };
  if (!plan?.id || !coordinate(origin)) return { status: "unavailable", reason: "ORIGIN_REQUIRED" };
  if (!coordinate(destination)) return { status: "unavailable", reason: "DESTINATION_REQUIRED" };
  if (!["DRIVING", "WALKING", "CYCLING"].includes(mode)) return { status: "error", reason: "INVALID_MODE" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    const response = await fetcher(new URL("/v1/routing/route", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ request: { origin, destination, mode } }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "error", reason: `HTTP_${response.status}` };
    const body = await response.json();
    const result = body?.result;
    if (result?.status === "FAILURE") return { status: "error", reason: result.reason || "NO_ROUTE" };
    if (result?.status !== "SUCCESS" || !result.provider?.trim() ||
      !Number.isFinite(result.distanceMeters) || result.distanceMeters <= 0 ||
      !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) {
      return { status: "error", reason: "INVALID_ROUTING_RESULT" };
    }
    // A route provider response does not establish an independent evidence record.
    return { status: "route_found_unverified", planId: plan.id, route: result, canStart: false };
  } catch {
    return { status: controller.signal.aborted ? "timeout" : "error", reason: controller.signal.aborted ? "REQUEST_ABORTED_OR_TIMEOUT" : "NETWORK_UNAVAILABLE" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
