export type PlaceResult = { id: string; name: string; address: string; coordinate: readonly [number, number]; source: "TomTom" };
export type PlaceSearch = { status: "ready"; items: PlaceResult[] } | { status: "unavailable" | "error"; items: []; reason: string };
export async function searchPlaces(baseUrl: string | undefined, query: string, signal?: AbortSignal): Promise<PlaceSearch> {
  if (!baseUrl) return { status: "unavailable", items: [], reason: "API_NOT_CONFIGURED" };
  if (query.trim().length < 3) return { status: "ready", items: [] };
  try {
    const url = new URL("/v1/places/search", baseUrl);
    url.searchParams.set("q", query.trim());
    const response = await fetch(url.toString(), { signal });
    if (response.status === 503) return { status: "unavailable", items: [], reason: "GEOCODING_PROVIDER_NOT_CONFIGURED" };
    if (!response.ok) return { status: "error", items: [], reason: "HTTP_" + response.status };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items)) throw Error("INVALID_CONTRACT");
    const items: PlaceResult[] = [];
    for (const item of body.items) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      const point = value.coordinate;
      if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.address !== "string" ||
          !Array.isArray(point) || point.length !== 2 || typeof point[0] !== "number" || typeof point[1] !== "number" ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90 ||
          value.source !== "TomTom") continue;
      items.push({ id: value.id, name: value.name, address: value.address, coordinate: [point[0], point[1]], source: "TomTom" });
    }
    return { status: "ready", items };
  } catch {
    return { status: "error", items: [], reason: signal?.aborted ? "ABORTED" : "NETWORK_UNAVAILABLE" };
  }
}
