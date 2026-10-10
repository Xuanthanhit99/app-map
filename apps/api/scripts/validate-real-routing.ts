import { TomTomRoutingProvider } from "../src/tomtom-routing-provider";
import { HANOI_GOLDEN_ROUTES } from "../../../src/routing/hanoi-golden-routes";
import { isRenderableRoute } from "../../../src/map/map-contract";

async function main(): Promise<void> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) throw new Error("TOMTOM_API_KEY is required for real routing validation");

  const provider = new TomTomRoutingProvider(key);
  let failed = false;

  for (const golden of HANOI_GOLDEN_ROUTES) {
    const result = await provider.route(golden.request);
    if (result.status !== "SUCCESS") {
      console.error(`[FAIL] ${golden.id}: provider=${result.provider} reason=${result.reason}`);
      failed = true;
      continue;
    }

    const ok =
      isRenderableRoute(result.route) &&
      result.distanceMeters >= golden.expected.minDistanceMeters &&
      result.distanceMeters <= golden.expected.maxDistanceMeters &&
      result.durationSeconds >= golden.expected.minDurationSeconds &&
      result.durationSeconds <= golden.expected.maxDurationSeconds;

    console.log(`[${ok ? "PASS" : "FAIL"}] ${golden.id}: distance=${result.distanceMeters}m duration=${result.durationSeconds}s points=${result.route.coordinates.length}`);
    if (!ok) failed = true;
  }

  if (failed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Real routing validation failed");
  process.exitCode = 1;
});
