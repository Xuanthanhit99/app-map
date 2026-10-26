import { describe, expect, it } from "vitest";
import { TomTomRoutingProvider } from "../apps/api/src/tomtom-routing-provider";

describe("TomTom server routing adapter", () => {
  it("maps traffic-aware TomTom response into provider-neutral route", async () => {
    let requested = "";
    const transport: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 1200, travelTimeInSeconds: 420 }, legs: [{ points: [{ latitude: 21.02, longitude: 105.83 }, { latitude: 21.03, longitude: 105.84 }] }] }] }), { status: 200 });
    };
    const result = await new TomTomRoutingProvider("server-secret", transport).route({ origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" });
    expect(result).toMatchObject({ status: "SUCCESS", provider: "tomtom", distanceMeters: 1200, durationSeconds: 420 });
    expect(requested).toContain("traffic=true");
    expect(requested).toContain("travelMode=car");
    expect(requested).toContain("key=server-secret");
  });

  it("fails closed on malformed successful response", async () => {
    const transport: typeof fetch = async () => new Response(JSON.stringify({ routes: [] }), { status: 200 });
    expect(await new TomTomRoutingProvider("secret", transport).route({ origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" })).toMatchObject({ status: "FAILURE", reason: "INVALID_RESPONSE", retryable: false });
  });

  it("normalizes provider throttling as retryable unavailable", async () => {
    const transport: typeof fetch = async () => new Response("", { status: 429 });
    expect(await new TomTomRoutingProvider("secret", transport).route({ origin: [105.83, 21.02], destination: [105.84, 21.03], mode: "DRIVING" })).toMatchObject({ status: "FAILURE", reason: "UNAVAILABLE", retryable: true });
  });
});
