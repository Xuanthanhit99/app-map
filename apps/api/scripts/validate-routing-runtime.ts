import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const key = process.env.TOMTOM_API_KEY;
if (!key) throw new Error("TOMTOM_API_KEY is required");

const port = "3001";
const serverPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
  env: { ...process.env, PORT: port, TOMTOM_API_KEY: key },
  stdio: ["ignore", "pipe", "pipe"],
});

let childExited = false;
let childExitDescription = "";
let childStdout = "";
let childStderr = "";

const capture = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(-4000);
child.stdout.on("data", (chunk: Buffer) => {
  childStdout = capture(childStdout, chunk);
});
child.stderr.on("data", (chunk: Buffer) => {
  childStderr = capture(childStderr, chunk);
});
child.on("error", (error) => {
  childExited = true;
  childExitDescription = `spawn error: ${error.message}`;
});
child.on("exit", (code, signal) => {
  childExited = true;
  childExitDescription = `exit code=${code ?? "null"} signal=${signal ?? "null"}`;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startupFailure(): Error {
  const details = [
    childExitDescription,
    childStdout.trim() ? `stdout: ${childStdout.trim()}` : "",
    childStderr.trim() ? `stderr: ${childStderr.trim()}` : "",
  ].filter(Boolean).join("\n");
  return new Error(`Routing API process exited before becoming ready${details ? `\n${details}` : ""}`);
}

async function main() {
  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (childExited) throw startupFailure();
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
        if (childExited) throw startupFailure();
        await sleep(200);
      }
    }
    if (!response) {
      if (childExited) throw startupFailure();
      throw new Error("Routing API did not become ready before the smoke-test deadline");
    }
    if (!response.ok) throw new Error(`Routing API returned HTTP ${response.status}`);
    const payload = await response.json() as { result?: { status?: string; route?: { coordinates?: unknown[] }; provider?: string } };
    if (payload.result?.status !== "SUCCESS" || !Array.isArray(payload.result.route?.coordinates) || payload.result.route.coordinates.length < 2) {
      throw new Error("Routing API did not return a renderable success route");
    }
    console.log(`[PASS] runtime-routing-api provider=${payload.result.provider ?? "unknown"} points=${payload.result.route.coordinates.length}`);
  } finally {
    if (!childExited) child.kill("SIGTERM");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Runtime routing smoke failed");
  if (!childExited) child.kill("SIGTERM");
  process.exitCode = 1;
});
