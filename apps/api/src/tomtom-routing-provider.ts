import type { Coordinate } from "../../../src/map/map-contract";
import type { RoutingProvider, RoutingRequest, RoutingResult } from "../../../src/routing/routing-contract";

type FetchLike = typeof fetch;

interface TomTomResponse {
  routes?: Array<{
    summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
    legs?: Array<{ points?: Array<{ latitude?: number; longitude?: number }> }>;
  }>;
}

function mode(mode: RoutingRequest["mode"]): string {
  return mode === "DRIVING" ? "car" : mode === "WALKING" ? "pedestrian" : "bicycle";
}

function coordinates(payload: TomTomResponse): Coordinate[] {
  const points = payload.routes?.[0]?.legs?.flatMap((leg) => leg.points ?? []) ?? [];
  return points.flatMap((point) =>
    typeof point.latitude === "number" && typeof point.longitude === "number"
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

  async route(request: RoutingRequest): Promise<RoutingResult> {
    const [originLng, originLat] = request.origin;
    const [destinationLng, destinationLat] = request.destination;
    const path = `${originLat},${originLng}:${destinationLat},${destinationLng}`;
    const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json`);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("traffic", "true");
    url.searchParams.set("travelMode", mode(request.mode));
    url.searchParams.set("routeRepresentation", "polyline");

    let response: Response;
    try {
      response = await this.transport(url);
    } catch {
      return { status: "FAILURE", reason: "UNAVAILABLE", retryable: true, provider: this.id };
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        return { status: "FAILURE", reason: "NO_ROUTE", retryable: false, provider: this.id };
      }
      return { status: "FAILURE", reason: "UNAVAILABLE", retryable: response.status >= 500 || response.status === 429, provider: this.id };
    }

    const payload = await response.json() as TomTomResponse;
    const summary = payload.routes?.[0]?.summary;
    const routeCoordinates = coordinates(payload);
    if (!summary || typeof summary.lengthInMeters !== "number" || typeof summary.travelTimeInSeconds !== "number" || routeCoordinates.length < 2) {
      return { status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false, provider: this.id };
    }

    return {
      status: "SUCCESS",
      provider: this.id,
      distanceMeters: summary.lengthInMeters,
      durationSeconds: summary.travelTimeInSeconds,
      route: { id: `tomtom-${Date.now()}`, source: "ROUTING_ENGINE", generatedAt: Date.now(), coordinates: routeCoordinates },
    };
  }
}

export function tomTomRoutingProviderFromEnv(env: NodeJS.ProcessEnv = process.env): TomTomRoutingProvider {
  const apiKey = env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error("TOMTOM_API_KEY is required");
  return new TomTomRoutingProvider(apiKey);
}
