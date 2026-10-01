export type RoadState =
  | "CLEAR"
  | "SLOW"
  | "FLOODED_LIGHT"
  | "FLOODED_MODERATE"
  | "FLOODED_DEEP"
  | "BLOCKED";

export type ParkingAvailability =
  | "AVAILABLE"
  | "LIMITED"
  | "FULL"
  | "UNKNOWN"
  | "CLOSED"
  | "RESTRICTED";

export type CrowdState = "QUIET" | "NORMAL" | "BUSY" | "VERY_BUSY";
export type QueueState = "NONE" | "SHORT" | "MODERATE" | "LONG" | "VERY_LONG";

export type WeatherNature = "OBSERVED" | "FORECAST";
export type WeatherSourceType =
  | "SENSOR"
  | "RADAR"
  | "SATELLITE"
  | "COMMUNITY"
  | "OFFICIAL_PROVIDER";

export type PriceProvenance = "OFFICIAL" | "OBSERVED" | "ESTIMATED" | "PROMOTION";
export type PriceFreshness = "CURRENT" | "RECENT" | "AGING" | "STALE" | "UNKNOWN";
