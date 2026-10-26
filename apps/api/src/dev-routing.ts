import type { RoutingProvider } from "../../../src/routing/routing-contract";

/**
 * LOCAL DEVELOPMENT ONLY (DEV_FAKE_ROUTING=true, refused in qa/production by config).
 * A straight-line route with a nominal 20 km/h duration so journey lifecycle screens can be exercised
 * without a routing key. Its provider id makes the double visible in every response.
 */
export const devStraightLineRouting: RoutingProvider = {
  id: "dev-straight-line",
  async route(request) {
    const [a, b] = [request.origin, request.destination];
    const steps = 8;
    const coordinates = Array.from({ length: steps + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps] as const);
    const R = 6371008.8, r = Math.PI / 180;
    const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    const meters = Math.max(1, 2 * R * Math.asin(Math.sqrt(h)));
    return { status: "SUCCESS", provider: "dev-straight-line", distanceMeters: Math.round(meters), durationSeconds: Math.round(meters / (20 / 3.6)),
      route: { id: `dev-${Date.now()}`, source: "MOCK", generatedAt: Date.now(), coordinates } };
  },
};
