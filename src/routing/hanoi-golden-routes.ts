import type { RoutingRequest } from "../routing/routing-contract";

export interface GoldenRoute {
  id: string;
  request: RoutingRequest;
  expected: {
    minDistanceMeters: number;
    maxDistanceMeters: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
}

export const HANOI_GOLDEN_ROUTES: readonly GoldenRoute[] = [
  {
    id: "hoan-kiem-to-west-lake",
    request: { origin: [105.8525, 21.0285], destination: [105.8230, 21.0583], mode: "DRIVING" },
    expected: { minDistanceMeters: 3000, maxDistanceMeters: 10000, minDurationSeconds: 300, maxDurationSeconds: 3600 },
  },
  {
    id: "cau-giay-to-hoan-kiem",
    request: { origin: [105.7900, 21.0365], destination: [105.8525, 21.0285], mode: "DRIVING" },
    expected: { minDistanceMeters: 5000, maxDistanceMeters: 15000, minDurationSeconds: 500, maxDurationSeconds: 5400 },
  },
  {
    id: "noi-bai-to-hoan-kiem",
    request: { origin: [105.8072, 21.2187], destination: [105.8525, 21.0285], mode: "DRIVING" },
    expected: { minDistanceMeters: 18000, maxDistanceMeters: 45000, minDurationSeconds: 900, maxDurationSeconds: 7200 },
  },
] as const;
