import { z } from "zod";
import { ApiError, unavailable } from "../http/errors";
import type { Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import type { AppDeps } from "./deps";

type FetchLike = typeof fetch;

/** TomTom search pass-through. Results are not persisted (licence) and are labelled with their source. */
export async function tomtomSearch(key: string, q: string, transport: FetchLike = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  let upstream: Response;
  try {
    const url = new URL("https://api.tomtom.com/search/2/search/" + encodeURIComponent(q) + ".json");
    url.searchParams.set("key", key);
    url.searchParams.set("limit", "5");
    url.searchParams.set("typeahead", "true");
    upstream = await transport(url, { signal: controller.signal, redirect: "error" });
  } catch { throw new ApiError(502, "GEOCODING_UPSTREAM_UNAVAILABLE"); }
  finally { clearTimeout(timer); }
  if (!upstream.ok) throw new ApiError(502, "GEOCODING_UPSTREAM_UNAVAILABLE");
  const data: unknown = await upstream.json().catch(() => null);
  const records = data && typeof data === "object" && "results" in data && Array.isArray(data.results) ? data.results : [];
  return records.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const pos = item.position as Record<string, unknown> | undefined;
    const address = item.address as Record<string, unknown> | undefined;
    const point = item.poi as Record<string, unknown> | undefined;
    const lat = pos?.lat, lon = pos?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180 || typeof item.id !== "string") return [];
    const fullAddress = typeof address?.freeformAddress === "string" ? address.freeformAddress : "";
    const name = typeof point?.name === "string" ? point.name : fullAddress;
    if (!name.trim() || !fullAddress.trim()) return [];
    return [{ id: item.id, name, address: fullAddress, coordinate: [lon, lat] as [number, number], source: "TomTom" as const }];
  });
}

export function registerGeocodeRoutes(router: Router, deps: AppDeps, transport: FetchLike = fetch) {
  router.get("/v1/places/search", async (ctx) => {
    const { q } = parse(z.object({ q: z.string().trim().min(3).max(160) }).strict(), queryObject(ctx.query), "INVALID_QUERY");
    if (!deps.config.tomtomSearchKey) throw unavailable("GEOCODING_PROVIDER_NOT_CONFIGURED");
    return { body: { status: "ready", items: await tomtomSearch(deps.config.tomtomSearchKey, q, transport) } };
  }, { rateLimit: { name: "geocode", limit: 60, windowMs: 60_000 } });
}
