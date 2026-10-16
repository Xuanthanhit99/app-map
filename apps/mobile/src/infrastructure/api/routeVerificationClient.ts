export type RouteCheck =
  | { status: "unavailable"; reason: "API_NOT_CONFIGURED" | "ORIGIN_REQUIRED" | "DESTINATION_REQUIRED" }
  | { status: "error"; reason: string }
  | { status: "timeout"; reason: "REQUEST_ABORTED_OR_TIMEOUT" }
  | { status: "route_found_unverified"; provider: string; distanceMeters: number; durationSeconds: number; canStart: false; route?: { id: string; source: "ROUTING_ENGINE"; generatedAt: number; coordinates: readonly Coordinate[] } };

type Coordinate = readonly [number, number];
function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

/** Caller supplies origin explicitly; this client never requests device location. */
export async function checkPlanRoute(input: {
  baseUrl?: string;
  planId: string;
  origin?: Coordinate | null;
  destination?: Coordinate | null;
  mode?: "DRIVING" | "WALKING" | "CYCLING";
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<RouteCheck> {
  if (!input.baseUrl) return { status: "unavailable", reason: "API_NOT_CONFIGURED" };
  if (!validCoordinate(input.origin)) return { status: "unavailable", reason: "ORIGIN_REQUIRED" };
  if (!validCoordinate(input.destination)) return { status: "unavailable", reason: "DESTINATION_REQUIRED" };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    if (input.signal?.aborted) controller.abort();
    const response = await (input.fetcher ?? fetch)(new URL("/v1/routing/route", input.baseUrl).toString(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ request: { origin: input.origin, destination: input.destination, mode: input.mode ?? "DRIVING" } }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "error", reason: `HTTP_${response.status}` };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("result" in body)) return { status: "error", reason: "INVALID_CONTRACT" };
    const result = body.result as Record<string, unknown> | null;
    if (result?.status === "FAILURE") return { status: "error", reason: typeof result.reason === "string" ? result.reason : "NO_ROUTE" };
    if (result?.status !== "SUCCESS" || typeof result.provider !== "string" || !result.provider.trim() ||
      typeof result.distanceMeters !== "number" || !Number.isFinite(result.distanceMeters) || result.distanceMeters <= 0 ||
      typeof result.durationSeconds !== "number" || !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) {
      return { status: "error", reason: "INVALID_ROUTING_RESULT" };
    }
    // The backend contract is result.route.coordinates, not result.geometry.
    const candidate = result.route && typeof result.route === "object" ? result.route as Record<string, unknown> : null;
    const points = candidate?.coordinates;
    const valid = candidate?.source === "ROUTING_ENGINE" && typeof candidate.id === "string" &&
      typeof candidate.generatedAt === "number" && Number.isFinite(candidate.generatedAt) &&
      Array.isArray(points) && points.length >= 2 && points.length <= 20000 && points.every(validCoordinate);
    const route = valid ? { id: candidate!.id as string, source: "ROUTING_ENGINE" as const,
      generatedAt: candidate!.generatedAt as number, coordinates: points as Coordinate[] } : undefined;
    return { status: "route_found_unverified", provider: result.provider, distanceMeters: result.distanceMeters, durationSeconds: result.durationSeconds, canStart: false, ...(route ? { route } : {}) };
  } catch {
    return controller.signal.aborted ? { status: "timeout", reason: "REQUEST_ABORTED_OR_TIMEOUT" } : { status: "error", reason: "NETWORK_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}
