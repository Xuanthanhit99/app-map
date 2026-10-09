import { useMemo } from "react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";

type Props = {
  location: LocationLifecycle; camera: CameraMode; route?: RouteGeometry;
  markers?: readonly MapMarker[]; selection?: MapSelection;
  onSelectMarker?: (id: string) => void; accessibilityLabel: string;
  onUserGesture?: () => void; followCamera?: boolean;
  mapStyleId?: string; mode?: "PREVIEW" | "FULL";
};

/** OSM embedded interactive map: no geolocation permission required, no invented device position.
 * Embed endpoint has independent tile loading and visible OSM attribution.
 */
export function RealityMap({ location, camera, accessibilityLabel, mode = "FULL", followCamera = true }: Props) {
  const ready = location.status === "READY" || location.status === "DEGRADED";
  const coordinate = location.status === "READY"
    ? [location.longitude, location.latitude]
    : location.status === "DEGRADED"
      ? [location.lastKnown.longitude, location.lastKnown.latitude]
      : null;
  const url = useMemo(() => {
    const actual = followCamera && ready && coordinate ? coordinate : null;
    const center = camera.mode === "INSPECT" ? camera.center
      : camera.mode === "OVERVIEW" && camera.center ? camera.center
      : actual;
    // Neutral country-level overview when no location is supplied, never a claimed user fix.
    const lon = center?.[0] ?? 106;
    const lat = center?.[1] ?? 16;
    const span = actual ? 0.025 : center ? 0.12 : 9;
    const params = new URLSearchParams({
      bbox: [lon - span, lat - span, lon + span, lat + span].join(","),
      layer: "mapnik",
    });
    if (actual) params.set("marker", actual[1] + "," + actual[0]);
    return "https://www.openstreetmap.org/export/embed.html?" + params.toString();
  }, [location.status, coordinate?.[0], coordinate?.[1], followCamera, camera.mode]);
  return <View style={[styles.root, mode === "PREVIEW" && styles.preview]}>
    {React.createElement("iframe", {
      title: accessibilityLabel,
      src: url,
      loading: "lazy",
      referrerPolicy: "strict-origin-when-cross-origin",
      style: { width: "100%", height: "100%", minHeight: mode === "PREVIEW" ? 160 : 340, border: 0, backgroundColor: "#DDE6E8" },
    })}
    {!ready && mode === "FULL" ? <View style={styles.notice}><Text style={styles.noticeText}>Bản đồ tổng quan · không sử dụng vị trí thiết bị</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 340, backgroundColor: "#DDE6E8", overflow: "hidden" },
  preview: { minHeight: 160 },
  notice: { position: "absolute", left: 10, top: 10, backgroundColor: "#102A3B", padding: 8, borderRadius: 8 },
  noticeText: { color: "#F4F4F0", fontSize: 11 },
});
