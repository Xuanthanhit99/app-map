import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import { StyleSheet, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import { isRenderableRoute } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";

const PRODUCTION_STYLE = {
  version: 8 as const,
  sources: {
    openmaptiles: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background" as const, paint: { "background-color": "#EDF2EF" } },
    { id: "openmaptiles", type: "raster" as const, source: "openmaptiles", minzoom: 0, maxzoom: 19 },
  ],
};
function initialView(camera: CameraMode, location: LocationLifecycle) {
  if (camera.mode === "INSPECT") return { center: [...camera.center] as [number, number], zoom: camera.zoom };
  if (camera.mode === "OVERVIEW" && camera.center) return { center: [...camera.center] as [number, number], zoom: 11 };
  if (camera.mode === "FOLLOW_USER" && location.status === "READY") return { center: [location.longitude, location.latitude] as [number, number], zoom: camera.zoom };
  if (location.status === "DEGRADED") return { center: [location.lastKnown.longitude, location.lastKnown.latitude] as [number, number], zoom: 12 };
  return undefined;
}

export function RealityMap({ location, camera, route, markers = [], selection, onSelectMarker, accessibilityLabel }: {
  location: LocationLifecycle;
  camera: CameraMode;
  route?: RouteGeometry;
  markers?: readonly MapMarker[];
  selection?: MapSelection;
  onSelectMarker?: (id: string) => void;
  accessibilityLabel: string;
}) {
  const view = initialView(camera, location);
  const userCoordinate = location.status === "READY"
    ? [location.longitude, location.latitude] as [number, number]
    : location.status === "DEGRADED"
      ? [location.lastKnown.longitude, location.lastKnown.latitude] as [number, number]
      : undefined;
  const userFeature = userCoordinate ? { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: userCoordinate } } : undefined;
  const routeFeature = route && isRenderableRoute(route) ? { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route.coordinates.map(([lng, lat]) => [lng, lat]) } } : undefined;
  const markerCollection = { type: "FeatureCollection" as const, features: markers.map((marker) => ({ type: "Feature" as const, id: marker.id, properties: { id: marker.id, selected: marker.id === selection?.selectedId }, geometry: { type: "Point" as const, coordinates: [...marker.coordinate] } })) };
  const routeSummary = routeFeature ? ` Tuyến đường có ${route!.coordinates.length} điểm hình học.` : "";
  const selectionSummary = selection?.selectedId ? ` Đang chọn ${selection.selectedId}.` : "";

  return (
    <View style={styles.root} accessible={false}>
      <Map style={styles.map} mapStyle={PRODUCTION_STYLE}>
        {view ? <Camera centerCoordinate={view.center} zoomLevel={view.zoom} animationDuration={500} /> : <Camera />}
        {routeFeature ? <GeoJSONSource id="active-route" data={routeFeature}><Layer id="active-route-line" type="line" paint={{ "line-width": 4 }} /></GeoJSONSource> : null}
        {markers.length ? <GeoJSONSource id="reality-markers" data={markerCollection} onPress={(event) => {
          const id = event.nativeEvent.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectMarker?.(id);
        }}><Layer id="reality-marker-dots" type="circle" paint={{ "circle-radius": 7 }} /></GeoJSONSource> : null}
        {userFeature ? <GeoJSONSource id="reality-user-location" data={userFeature}><Layer id="reality-user-location-dot" type="circle" paint={{ "circle-radius": 8, "circle-stroke-width": 3 }} /></GeoJSONSource> : null}
      </Map>
      <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel + routeSummary + selectionSummary} style={styles.accessibleEquivalent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  accessibleEquivalent: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
