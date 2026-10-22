import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { messageFor } from "@core/i18n/error-messages";
import { api, ApiError } from "../../infrastructure/api/client";
import { useAuth } from "../../infrastructure/auth/AuthContext";
import { Button, Card, H, Notice, P, Screen, StateRow, type MobileState } from "../../ui/kit";

type Detail = { place: { id: string; slug: string; name: string; categoryLabel: string; address: string | null; coordinate: [number, number]; openingHours: { raw: string; note: string } | null; wheelchair: string | null; source: { attribution: string } };
  states: MobileState[]; saved: boolean; evaluatedAt: string };

/** Place Now, backed by the live API. No local fixtures: unknown is shown as unknown. */
export function PlaceNowScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!slug) { setError("Thiếu địa điểm."); return; }
    try { setD(await api<Detail>(`/v1/places/${encodeURIComponent(slug)}`)); setError(null); }
    catch (e) { setError(messageFor(e instanceof ApiError ? e.code : undefined)); }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <Screen title="Địa điểm"><Notice tone="error">{error}</Notice><Button kind="secondary" label="Thử lại" onPress={() => void load()} /></Screen>;
  if (!d) return <Screen title="Địa điểm"><P muted>Đang tải tình trạng hiện tại…</P></Screen>;
  const informative = d.states.filter((s) => s.truth !== "UNKNOWN" || s.signals.length);
  const unknown = d.states.filter((s) => s.truth === "UNKNOWN" && !s.signals.length && s.domain !== "PRICE");
  return (
    <Screen title={d.place.name} eyebrow={d.place.categoryLabel.toUpperCase()}>
      {d.place.address ? <P muted>{d.place.address}</P> : null}
      <View style={{ gap: 10 }}>{informative.map((s) => <StateRow key={s.domain} state={s} />)}</View>
      {unknown.length ? <Card dashed><H>Chưa rõ lúc này</H><P muted small>Chưa có báo cáo đã đối chứng hay nguồn trực tiếp gần đây về: {unknown.map((s) => s.domain === "PLACE_OPEN" ? "mở cửa" : s.domain === "CROWD" ? "mức đông" : s.domain === "QUEUE" ? "hàng chờ" : "bãi xe").join(", ")}.</P></Card> : null}
      {d.place.openingHours ? <P muted small>Giờ mở cửa công bố: {d.place.openingHours.raw}. {d.place.openingHours.note}</P> : null}
      <Button label="Chỉ đường" onPress={() => router.push({ pathname: "/(tabs)/journey", params: { to: d.place.slug } })} />
      <Button kind="secondary" label="Báo tình trạng tại đây" onPress={() => router.push({ pathname: "/report-action", params: { placeId: d.place.id, placeName: d.place.name } })} />
      {user ? <Button kind="secondary" label={d.saved ? "Đã lưu" : "Lưu địa điểm"} disabled={d.saved} onPress={() => void api("/v1/me/saved-places", { method: "POST", body: { placeId: d.place.id } }).then(() => { setMsg("Đã lưu."); return load(); }).catch((e) => setMsg(messageFor(e instanceof ApiError ? e.code : undefined)))} /> : null}
      {msg ? <Notice>{msg}</Notice> : null}
      <P muted small>Nguồn địa điểm: {d.place.source.attribution}. Bản đồ © OpenStreetMap contributors.</P>
      {process.env.EXPO_PUBLIC_WEB_URL ? <Button kind="quiet" label="Mở trên web" onPress={() => void Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_URL}/dia-diem/${d.place.slug}`)} /> : null}
    </Screen>
  );
}
