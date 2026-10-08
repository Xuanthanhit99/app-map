import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import { StyleSheet, Text, View } from "react-native";
import type { CameraMode, MapMarker, MapSelection, RouteGeometry } from "@core/map/map-contract";
import { isRenderableRoute } from "@core/map/map-contract";
import type { LocationLifecycle } from "@core/location/location-lifecycle";
import { resolveMapProviderConfig } from "./mapProviderConfig";

function initialView(camera: CameraMode, location: LocationLifecycle) {
  if (camera.mode === "INSPECT") return { center: [...camera.center] as [number, number], zoom: camera.zoom };
  if (camera.mode === "OVERVIEW" && camera.center) return { center: [...camera.center] as [number, number], zoom: 11 };
  if (camera.mode === "FOLLOW_USER" && location.status === "READY") return { center: [location.longitude, location.latitude] as [number, number], zoom: camera.zoom };
  if (location.status === "DEGRADED") return { center: [location.lastKnown.longitude, location.lastKnown.latitude] as [number, number], zoom: 12 };
  return undefined;
}

export function RealityMap({ location, camera, route, markers = [], selection, onSelectMarker, accessibilityLabel, mode = "FULL" }: {
  location: LocationLifecycle; camera: CameraMode; route?: RouteGeometry; markers?: readonly MapMarker[];
  selection?: MapSelection; onSelectMarker?: (id: string) => void; accessibilityLabel: string; mode?: "PREVIEW" | "FULL";
}) {
  const view = initialView(camera, location);
  const userCoordinate = location.status === "READY" ? [location.longitude, location.latitude] as [number, number] : location.status === "DEGRADED" ? [location.lastKnown.longitude, location.lastKnown.latitude] as [number, number] : undefined;
  const userFeature = userCoordinate ? { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: userCoordinate } } : undefined;
  const routeFeature = route && isRenderableRoute(route) ? { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route.coordinates.map(([lng, lat]) => [lng, lat]) } } : undefined;
  const markerCollection = { type: "FeatureCollection" as const, features: markers.map((marker) => ({ type: "Feature" as const, id: marker.id, properties: { id: marker.id, selected: marker.id === selection?.selectedId }, geometry: { type: "Point" as const, coordinates: [...marker.coordinate] } })) };
  const routeSummary = routeFeature ? ` Tuyến đường có ${route!.coordinates.length} điểm hình học.` : "";
  const selectionSummary = selection?.selectedId ? ` Đang chọn ${selection.selectedId}.` : "";

  const provider = resolveMapProviderConfig();

  if (provider.status !== "READY" || !provider.styleUrl) {
    return <View style={styles.degraded} accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel + " Bản đồ nền chưa được cấu hình."}>
      <View style={styles.gridA}/><View style={styles.gridB}/>{userCoordinate ? <View style={styles.userDot}/> : null}
      <Text style={styles.degradedTitle}>SPATIAL EVIDENCE</Text><Text style={styles.degradedText}>Chưa cấu hình nhà cung cấp bản đồ nền</Text>
    </View>;
  }

  return <View style={styles.root} accessible={false}>
    <Map style={styles.map} mapStyle={provider.styleUrl} compassEnabled={mode === "FULL"} scrollEnabled={mode === "FULL"} zoomEnabled={mode === "FULL"} rotateEnabled={mode === "FULL"} pitchEnabled={mode === "FULL"}>
      {view ? <Camera center={view.center} zoom={view.zoom} duration={mode === "PREVIEW" ? 0 : 500} easing="ease" /> : <Camera />}
      {routeFeature ? <GeoJSONSource id="active-route" data={routeFeature}><Layer id="active-route-line" type="line" paint={{ "line-width": 4 }} /></GeoJSONSource> : null}
      {markers.length ? <GeoJSONSource id="reality-markers" data={markerCollection} onPress={(event) => { const id=event.nativeEvent.features?.[0]?.properties?.id; if(typeof id==="string") onSelectMarker?.(id); }}><Layer id="reality-marker-dots" type="circle" paint={{ "circle-radius": 7 }} /></GeoJSONSource> : null}
      {userFeature ? <GeoJSONSource id="reality-user-location" data={userFeature}><Layer id="reality-user-location-dot" type="circle" paint={{ "circle-radius": 8, "circle-stroke-width": 3 }} /></GeoJSONSource> : null}
    </Map>
    {provider.attribution ? <View style={styles.attribution}><Text style={styles.attributionText}>{provider.attribution}</Text></View> : null}
    <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel + routeSummary + selectionSummary} style={styles.accessibleEquivalent}/>
  </View>;
}
const styles=StyleSheet.create({root:{flex:1},map:{flex:1},degraded:{flex:1,alignItems:"center",justifyContent:"center",overflow:"hidden",backgroundColor:"#0D211E"},gridA:{position:"absolute",width:"140%",height:1,backgroundColor:"rgba(137,166,158,.12)",transform:[{rotate:"22deg"}]},gridB:{position:"absolute",width:1,height:"140%",backgroundColor:"rgba(137,166,158,.12)",transform:[{rotate:"22deg"}]},userDot:{width:14,height:14,borderRadius:7,backgroundColor:"#D5B77A",borderWidth:3,borderColor:"#17332D",marginBottom:10},degradedTitle:{fontSize:10,fontWeight:"700",letterSpacing:1,color:"#8DA7A0"},degradedText:{fontSize:10,color:"#6F8D85",marginTop:3},attribution:{position:"absolute",right:6,bottom:5,backgroundColor:"rgba(8,25,22,.72)",paddingHorizontal:5,paddingVertical:2,borderRadius:5},attributionText:{fontSize:8,color:"#9BB2AC"},accessibleEquivalent:{position:"absolute",width:1,height:1,opacity:0}});