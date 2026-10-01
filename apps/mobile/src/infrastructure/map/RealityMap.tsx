import { Camera, Map, UserLocation } from "@maplibre/maplibre-react-native";
import { StyleSheet, View } from "react-native";
import type { ForegroundLocationState } from "../location/foreground-location";

const DEMO_STYLE = "https://demotiles.maplibre.org/style.json";
const DEFAULT_CENTER: [number, number] = [105.8342, 21.0278];

export function RealityMap({ location, accessibilityLabel }: { location: ForegroundLocationState; accessibilityLabel: string }) {
  const center: [number, number] = location.status === "READY"
    ? [location.longitude, location.latitude]
    : DEFAULT_CENTER;

  return (
    <View style={styles.root} accessible={false}>
      <Map style={styles.map} mapStyle={DEMO_STYLE}>
        <Camera initialViewState={{ center, zoom: location.status === "READY" ? 14 : 11 }} />
        {location.status === "READY" ? <UserLocation accuracy /> : null}
      </Map>
      <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel} style={styles.accessibleEquivalent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  accessibleEquivalent: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
