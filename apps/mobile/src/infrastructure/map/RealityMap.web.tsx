import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";
import type * as Leaflet from "leaflet";

type Props = {
  location: LocationLifecycle; camera: CameraMode; route?: RouteGeometry;
  markers?: readonly MapMarker[]; selection?: MapSelection;
  onSelectMarker?: (id: string) => void; accessibilityLabel: string;
  onUserGesture?: () => void; followCamera?: boolean;
  mapStyleId?: string; mode?: "PREVIEW" | "FULL";
};
type MapStatus = "loading" | "ready" | "error";

/** Raster tile renderer: no WebGL, geolocation or search provider required to display a map. */
export function RealityMap({ location, accessibilityLabel, mode = "FULL", followCamera = true, onUserGesture }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const userMarker = useRef<Leaflet.CircleMarker | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [retry, setRetry] = useState(0);
  const [mapReady, setMapReady] = useState(0);
  const userGesture = useRef(onUserGesture);
  userGesture.current = onUserGesture;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let localMap: Leaflet.Map | undefined;
    let tileErrors = 0;
    setStatus("loading");
    void import("leaflet").then(L => {
      if (cancelled) return;
      leaflet.current = L;
      localMap = L.map(node, { zoomControl: mode === "FULL", attributionControl: true });
      map.current = localMap;
      // Neutral Vietnam overview, NOT a device position.
      localMap.setView([16, 106], 5);
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19, minZoom: 2,
      });
      tiles.on("load", () => { if (!cancelled) setStatus("ready"); });
      tiles.on("tileerror", () => { if (!cancelled && ++tileErrors >= 3) setStatus("error"); });
      tiles.addTo(localMap);
      localMap.on("dragstart", () => userGesture.current?.());
      localMap.on("zoomstart", () => userGesture.current?.());
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => localMap?.invalidateSize());
        observer.observe(node);
      }
      setMapReady(value => value + 1);
      requestAnimationFrame(() => localMap?.invalidateSize());
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      userMarker.current = null;
      if (map.current === localMap) map.current = null;
      localMap?.remove();
    };
  }, [retry, mode]);

  const lat = location.status === "READY" ? location.latitude :
    location.status === "DEGRADED" ? location.lastKnown.latitude : null;
  const lon = location.status === "READY" ? location.longitude :
    location.status === "DEGRADED" ? location.lastKnown.longitude : null;
  useEffect(() => {
    const instance = map.current;
    const L = leaflet.current;
    if (!instance || !L) return;
    userMarker.current?.remove();
    userMarker.current = null;
    if (typeof lat !== "number" || typeof lon !== "number" ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    userMarker.current = L.circleMarker([lat, lon], {
      radius: 8, color: "#071C2C", weight: 2, fillColor: "#F4C979", fillOpacity: 1,
    }).addTo(instance).bindPopup("Vị trí thiết bị");
    if (followCamera) instance.setView([lat, lon], 14);
  }, [lat, lon, followCamera, mapReady]);

  return <View style={[styles.root, mode === "PREVIEW" && styles.preview]} accessibilityLabel={accessibilityLabel}>
    <div ref={host} style={{ width: "100%", height: "100%", minHeight: mode === "PREVIEW" ? 160 : 340, zIndex: 0 }} />
    {status === "loading" ? <View style={styles.notice}><Text style={styles.noticeText}>Đang tải bản đồ…</Text></View> : null}
    {status === "error" ? <View style={styles.error}>
      <Text style={styles.noticeText}>Không tải được lớp bản đồ. Kiểm tra mạng rồi thử lại.</Text>
      <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}>
        <Text style={styles.retryText}>Tải lại bản đồ</Text>
      </Pressable>
    </View> : null}
    {lat === null && mode === "FULL" ? <View pointerEvents="none" style={styles.overview}>
      <Text style={styles.noticeText}>Bản đồ tổng quan · không sử dụng vị trí thiết bị</Text>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 340, overflow: "hidden", backgroundColor: "#DDE6E8" },
  preview: { minHeight: 160 },
  notice: { position: "absolute", top: 10, left: 10, padding: 8, borderRadius: 10, backgroundColor: "#102A3B" },
  overview: { position: "absolute", top: 10, left: 10, padding: 8, borderRadius: 10, backgroundColor: "#102A3B" },
  noticeText: { color: "#FFFFFF", fontSize: 12 },
  error: { position: "absolute", top: 10, left: 10, right: 10, padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#102A3B" },
  retry: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F4C979" },
  retryText: { color: "#071C2C", fontWeight: "700" },
});
