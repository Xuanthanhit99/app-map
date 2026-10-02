import { createServer } from "node:http";
import { TomTomRoutingProvider } from "./tomtom-routing-provider";
import { handleRoutingRequest } from "./routing-http-handler";

const port = Number(process.env.PORT ?? 3001);
const key = process.env.TOMTOM_API_KEY;
if (!key) throw new Error("TOMTOM_API_KEY is required");

const primary = new TomTomRoutingProvider(key);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/routing/route") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
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
