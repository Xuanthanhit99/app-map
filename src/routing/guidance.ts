import type { Coordinate } from "../map/map-contract";
import type { RouteInstruction } from "./routing-contract";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(a: Coordinate, b: Coordinate): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Projects a position onto the route polyline (local equirectangular projection per segment).
 * Returns distance travelled along the route and the lateral distance from it.
 */
export function projectOntoRoute(route: Coordinate[], position: Coordinate): { alongMeters: number; offRouteMeters: number } | null {
  if (route.length < 2) return null;
  let best = { along: 0, off: Number.POSITIVE_INFINITY };
  let walked = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!, b = route[i + 1]!;
    const segLen = haversine(a, b);
    const k = Math.cos(rad((a[1] + b[1]) / 2)) * R;
    const ax = rad(a[0]) * k, ay = rad(a[1]) * R, bx = rad(b[0]) * k, by = rad(b[1]) * R;
    const px = rad(position[0]) * k, py = rad(position[1]) * R;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < best.off) best = { along: walked + t * segLen, off };
    walked += segLen;
  }
  return { alongMeters: best.along, offRouteMeters: best.off };
}

export type NextInstruction =
  | { status: "NO_GUIDANCE" }
  | { status: "OFF_ROUTE"; offRouteMeters: number }
  | { status: "NEXT"; instruction: RouteInstruction; inMeters: number; index: number }
  | { status: "FINISHED" };

/**
 * Next provider instruction ahead of the traveller. Guidance is suspended (OFF_ROUTE) beyond the
 * corridor so a stale instruction is never shown for a road the user is not on.
 */
export function nextInstruction(route: Coordinate[], instructions: RouteInstruction[] | null | undefined, position: Coordinate, corridorMeters = 60): NextInstruction {
  if (!instructions?.length) return { status: "NO_GUIDANCE" };
  const p = projectOntoRoute(route, position);
  if (!p) return { status: "NO_GUIDANCE" };
  if (p.offRouteMeters > corridorMeters) return { status: "OFF_ROUTE", offRouteMeters: Math.round(p.offRouteMeters) };
  // A maneuver counts as passed 15 m after its point (GPS noise near the junction).
  const index = instructions.findIndex((i) => i.routeOffsetMeters > p.alongMeters - 15);
  if (index < 0) return { status: "FINISHED" };
  return { status: "NEXT", instruction: instructions[index]!, inMeters: Math.max(0, Math.round(instructions[index]!.routeOffsetMeters - p.alongMeters)), index };
}

export function formatDistanceVi(m: number): string {
  if (m < 20) return "Ngay bây giờ";
  if (m < 1000) return `Sau ${Math.round(m / 10) * 10} m`;
  return `Sau ${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
