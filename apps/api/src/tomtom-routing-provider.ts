import type { Coordinate } from "../../../src/map/map-contract";
import type { RouteInstruction, RoutingProvider, RoutingRequest, RoutingResult } from "../../../src/routing/routing-contract";

type FetchLike = typeof fetch;

interface TomTomResponse {
  routes?: Array<{
    summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
    legs?: Array<{ points?: Array<{ latitude?: number; longitude?: number }> }>;
    guidance?: { instructions?: Array<{ routeOffsetInMeters?: number; maneuver?: string; message?: string; street?: string }> };
  }>;
}

/** Keeps only well-formed, monotonically ordered steps; malformed guidance degrades to route-only. */
function instructions(payload: TomTomResponse, lengthMeters: number): RouteInstruction[] | undefined {
  const raw = payload.routes?.[0]?.guidance?.instructions;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: RouteInstruction[] = [];
  let last = -1;
  for (const i of raw) {
    const offset = i.routeOffsetInMeters;
    if (typeof offset !== "number" || !Number.isFinite(offset) || offset < last || offset > lengthMeters + 50) return undefined;
    if (typeof i.message !== "string" || !i.message.trim() || typeof i.maneuver !== "string") return undefined;
    last = offset;
    out.push({ routeOffsetMeters: Math.round(offset), maneuver: i.maneuver.slice(0, 40), text: i.message.trim().slice(0, 200), ...(typeof i.street === "string" && i.street.trim() ? { street: i.street.trim().slice(0, 120) } : {}) });
  }
  return out.slice(0, 500);
}

function mode(mode: RoutingRequest["mode"]): string {
  return mode === "DRIVING" ? "car" : mode === "WALKING" ? "pedestrian" : "bicycle";
}

function coordinates(payload: TomTomResponse): Coordinate[] {
  const points = payload.routes?.[0]?.legs?.flatMap((leg) => leg.points ?? []) ?? [];
  return points.flatMap((point) =>
    typeof point.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
      ? [[point.longitude, point.latitude] as Coordinate]
      : []
  );
}

export class TomTomRoutingProvider implements RoutingProvider {
  readonly id = "tomtom";

  constructor(
    private readonly apiKey: string,
    private readonly transport: FetchLike = fetch,
  ) {}

  async route(request: RoutingRequest, signal?: AbortSignal): Promise<RoutingResult> {
    const [originLng, originLat] = request.origin;
    const [destinationLng, destinationLat] = request.destination;
    const path = `${originLat},${originLng}:${destinationLat},${destinationLng}`;
    const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json`);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("traffic", "true");
    url.searchParams.set("travelMode", mode(request.mode));
    url.searchParams.set("routeRepresentation", "polyline");
    // Provider-issued turn guidance in Vietnamese; REALITY never invents instructions.
    url.searchParams.set("instructionsType", "text");
    url.searchParams.set("language", "vi-VN");

    let response: Response;
    try {
      response = await this.transport(url, signal ? { signal, redirect: "error" } : { redirect: "error" });
    } catch {
      return { status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: this.id };
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        return { status: "FAILURE", reason: "NO_ROUTE", retryable: false, provider: this.id };
      }
      return { status: "FAILURE", reason: "UNAVAILABLE", retryable: response.status >= 500 || response.status === 429, provider: this.id };
    }

    let payload: TomTomResponse;
    try { payload = await response.json() as TomTomResponse; }
    catch { return { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: this.id }; }
    const summary = payload.routes?.[0]?.summary;
    const routeCoordinates = coordinates(payload);
    if (!summary || typeof summary.lengthInMeters !== "number" || typeof summary.travelTimeInSeconds !== "number" || !Number.isFinite(summary.lengthInMeters) || summary.lengthInMeters <= 0 || !Number.isFinite(summary.travelTimeInSeconds) || summary.travelTimeInSeconds <= 0 || routeCoordinates.length < 2) {
      return { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: this.id };
    }

    const steps = instructions(payload, summary.lengthInMeters);
    return {
      status: "SUCCESS",
      provider: this.id,
      distanceMeters: summary.lengthInMeters,
      durationSeconds: summary.travelTimeInSeconds,
      route: { id: `tomtom-${Date.now()}`, source: "ROUTING_ENGINE", generatedAt: Date.now(), coordinates: routeCoordinates },
      ...(steps ? { instructions: steps } : {}),
    };
  }
}

export function tomTomRoutingProviderFromEnv(env: NodeJS.ProcessEnv = process.env): TomTomRoutingProvider {
  const apiKey = env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error("TOMTOM_API_KEY is required");
  return new TomTomRoutingProvider(apiKey);
}
