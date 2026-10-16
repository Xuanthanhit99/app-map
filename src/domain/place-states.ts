export type PlaceOpenState = "OPEN" | "CLOSING_SOON" | "CLOSED" | "TEMPORARILY_CLOSED";

export type PlaceAvailabilityState =
  | "AVAILABLE"
  | "LIMITED"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export interface PlaceFacts {
  id: string;
  name: string;
  category: string;
  address?: string;
  accessibility?: string[];
}

export interface PlaceLiveSummary {
  open?: PlaceOpenState;
  crowd?: "QUIET" | "NORMAL" | "BUSY" | "VERY_BUSY";
  queue?: "NONE" | "SHORT" | "MODERATE" | "LONG" | "VERY_LONG";
  availableSeating?: PlaceAvailabilityState;
}
