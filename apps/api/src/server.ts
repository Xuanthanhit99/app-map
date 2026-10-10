import { createServer } from "node:http";
import { TomTomRoutingProvider } from "./tomtom-routing-provider";
import { handleRoutingRequest } from "./routing-http-handler";
import { handleRealityDecisionRead } from "./reality-decision-read";
import { handleVerifiedDecisionRead } from "./verified-decision-http";
import { UnconfiguredEvidenceRepository } from "./verified-evidence-repository";

const port = Number(process.env.PORT ?? 3001);
const key = process.env.TOMTOM_API_KEY;
const primary = key ? new TomTomRoutingProvider(key) : null;
const evidenceRepository = new UnconfiguredEvidenceRepository();

createServer(async (request, response) => {
  const origin = request.headers.origin;
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://127.0.0.1:4173,http://localhost:4173,http://localhost:8081,http://127.0.0.1:8081").split(",").map(value => value.trim());
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS" && origin && allowedOrigins.includes(origin)) { response.writeHead(204); response.end(); return; }
  if (request.method === "GET" && request.url?.startsWith("/v1/places/search")) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/v1/places/search") {
      response.writeHead(404); response.end(); return;
    }
    const q = (url.searchParams.get("q") ?? "").trim();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (q.length < 3 || q.length > 160) {
      response.writeHead(400); response.end(JSON.stringify({ error: "INVALID_QUERY" })); return;
    }
    const searchKey = process.env.TOMTOM_SEARCH_API_KEY;
    if (!searchKey) {
      response.writeHead(503); response.end(JSON.stringify({ error: "GEOCODING_PROVIDER_NOT_CONFIGURED" })); return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      let upstream: Response;
      try {
        const searchUrl = new URL("https://api.tomtom.com/search/2/search/" + encodeURIComponent(q) + ".json");
        searchUrl.searchParams.set("key", searchKey);
        searchUrl.searchParams.set("limit", "5");
        searchUrl.searchParams.set("typeahead", "true");
        upstream = await fetch(searchUrl, { signal: controller.signal });
      } finally { clearTimeout(timer); }
      if (!upstream.ok) throw Error("GEOCODING_UPSTREAM_ERROR");
      const data: unknown = await upstream.json();
      const records = data && typeof data === "object" && "results" in data && Array.isArray(data.results) ? data.results : [];
      const items = records.flatMap((entry: unknown) => {
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
        return [{ id: item.id, name, address: fullAddress, coordinate: [lon, lat], source: "TomTom" }];
      });
      response.writeHead(200); response.end(JSON.stringify({ status: "ready", items }));
    } catch {
      response.writeHead(502); response.end(JSON.stringify({ error: "GEOCODING_UPSTREAM_UNAVAILABLE" }));
    }
    return;
  }
  if (await handleVerifiedDecisionRead(request, response, evidenceRepository)) return;
  if (handleRealityDecisionRead(request, response)) return;
  if (request.method !== "POST" || request.url !== "/v1/routing/route") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }

  if (!primary) {
    response.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "ROUTING_PROVIDER_NOT_CONFIGURED" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 16_384) {
        response.writeHead(413, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      chunks.push(buffer);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    const result = await handleRoutingRequest(body, { primary, timeoutMs: 8_000 });
    response.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(result.body));
  } catch {
    response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "INVALID_REQUEST" }));
  }
}).listen(port);
