import { spawn } from "node:child_process";

const key = process.env.TOMTOM_API_KEY;
if (!key) throw new Error("TOMTOM_API_KEY is required");

const port = "3001";
const child = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
  env: { ...process.env, PORT: port, TOMTOM_API_KEY: key },
  stdio: ["ignore", "pipe", "pipe"],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/v1/routing/route`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ request: {
            origin: [105.8525, 21.0285],
            destination: [105.8230, 21.0583],
            mode: "DRIVING",
          }}),
        });
        break;
      } catch {
        await sleep(200);
      }
    }
    if (!response) throw new Error("Routing API did not become ready");
    if (!response.ok) throw new Error(`Routing API returned HTTP ${response.status}`);
    const payload = await response.json() as { result?: { status?: string; route?: { coordinates?: unknown[] }; provider?: string } };
    if (payload.result?.status !== "SUCCESS" || !Array.isArray(payload.result.route?.coordinates) || payload.result.route.coordinates.length < 2) {
      throw new Error("Routing API did not return a renderable success route");
    }
    console.log(`[PASS] runtime-routing-api provider=${payload.result.provider ?? "unknown"} points=${payload.result.route.coordinates.length}`);
  } finally {
    child.kill("SIGTERM");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Runtime routing smoke failed");
  child.kill("SIGTERM");
  process.exitCode = 1;
});
