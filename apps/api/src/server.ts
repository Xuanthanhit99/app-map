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
