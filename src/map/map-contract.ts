export type Coordinate = readonly [longitude: number, latitude: number];

export type CameraMode =
  | { mode: "OVERVIEW"; center?: Coordinate }
  | { mode: "FOLLOW_USER"; zoom: number }
  | { mode: "FOLLOW_ROUTE"; padding: number }
  | { mode: "INSPECT"; center: Coordinate; zoom: number };

export interface RouteGeometry {
  id: string;
  coordinates: readonly Coordinate[];
  source: "MOCK" | "ROUTING_ENGINE";
  generatedAt: number;
}

export interface MapSelection {
  selectedId?: string;
  source: "MAP" | "LIST" | "SYSTEM";
}

export interface MapMarker {
  id: string;
  coordinate: Coordinate;
}

export function selectMapItem(state: MapSelection, selectedId: string | undefined, source: MapSelection["source"]): MapSelection {
  return selectedId === undefined ? { source } : { selectedId, source };
}

export function synchronizeSelection(selectedId: string | undefined, source: MapSelection["source"]): MapSelection {
  return selectMapItem({ source: "SYSTEM" }, selectedId, source);
}

export function isRenderableRoute(route: RouteGeometry): boolean {
  return route.coordinates.length >= 2 && route.coordinates.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90);
}
