"use client";
import Link from "next/link";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import type { BrowserFix } from "./map-core";

type Option = { domain: string; value: string; label: string };
const ROAD: Option[] = [
  { domain: "ROAD", value: "FLOODED_LIGHT", label: "Ngập nhẹ" }, { domain: "ROAD", value: "FLOODED_MODERATE", label: "Ngập vừa" },
  { domain: "ROAD", value: "FLOODED_DEEP", label: "Ngập sâu" }, { domain: "ROAD", value: "ACCIDENT", label: "Tai nạn" },
  { domain: "ROAD", value: "BLOCKED", label: "Đường bị chặn" }, { domain: "ROAD", value: "CONGESTED", label: "Ùn tắc" },
  { domain: "ROAD", value: "SLOW", label: "Đi chậm" }, { domain: "ROAD", value: "CLEAR", label: "Thông thoáng" },
];
const WEATHER: Option[] = [
  { domain: "WEATHER", value: "RAIN_HEAVY", label: "Mưa to" }, { domain: "WEATHER", value: "THUNDERSTORM", label: "Dông" },
  { domain: "WEATHER", value: "RAIN_LIGHT", label: "Mưa nhẹ" }, { domain: "WEATHER", value: "CLEAR", label: "Trời tạnh" },
];
const PLACE: Option[] = [
  { domain: "PLACE_OPEN", value: "OPEN", label: "Đang mở cửa" }, { domain: "PLACE_OPEN", value: "CLOSED", label: "Đang đóng cửa" },
  { domain: "PLACE_OPEN", value: "TEMPORARILY_CLOSED", label: "Tạm đóng cửa" }, { domain: "CROWD", value: "QUIET", label: "Vắng" },
  { domain: "CROWD", value: "BUSY", label: "Đông" }, { domain: "CROWD", value: "VERY_BUSY", label: "Rất đông" },
  { domain: "QUEUE", value: "SHORT", label: "Chờ ít" }, { domain: "QUEUE", value: "LONG", label: "Chờ lâu" },
  { domain: "PARKING", value: "AVAILABLE", label: "Bãi xe còn chỗ" }, { domain: "PARKING", value: "FULL", label: "Bãi xe đầy" },
];

/** One-tap contribution. Precise location is sent to the server only for validation; the public sees a ~150 m cell. */
export function ReportPanel(props: { signedIn: boolean; fix: BrowserFix | null; mapCenter: () => { lat: number; lng: number } | null; placeId: string | null; placeName: string | null; onClose: () => void; onSubmitted: () => void }) {
  const [group, setGroup] = useState<"ROAD" | "WEATHER" | "PLACE">(props.placeId ? "PLACE" : "ROAD");
  const [choice, setChoice] = useState<Option | null>(null);
  const [useGps, setUseGps] = useState(Boolean(props.fix));
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error" | "consent"; message?: string; corroborated?: boolean }>({ kind: "idle" });

  if (!props.signedIn) {
    return (
      <section className="stack" aria-labelledby="rp-title">
        <h2 id="rp-title" style={{ fontSize: "var(--t-lg)" }}>Báo tình trạng</h2>
        <p className="small muted">Đăng nhập để gửi báo cáo. Báo cáo cần tài khoản để chống spam và để hai người khác nhau có thể xác nhận cho nhau.</p>
        <div className="row"><Link className="btn btn-primary" href="/dang-nhap?next=/ban-do?report=1">Đăng nhập</Link><button type="button" className="btn btn-quiet" onClick={props.onClose}>Để sau</button></div>
      </section>
    );
  }

  const options = group === "ROAD" ? ROAD : group === "WEATHER" ? WEATHER : PLACE;
  async function submit() {
    if (!choice) return;
    const at = useGps && props.fix ? { lat: props.fix.lat, lng: props.fix.lng } : props.mapCenter();
    if (!at) return;
    setState({ kind: "sending" });
    try {
      const r = await call<{ report: { status: string }; stateChanged: boolean }>("/v1/reports", { method: "POST", body: {
        domain: choice.domain, value: choice.value, latitude: at.lat, longitude: at.lng,
        ...(useGps && props.fix ? { accuracyMeters: Math.round(props.fix.accuracy), observedAt: new Date(Math.min(props.fix.observedAt, Date.now())).toISOString() } : {}),
        ...(group === "PLACE" && props.placeId ? { placeId: props.placeId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      } });
      setState({ kind: "done", corroborated: r.report.status === "CORROBORATED" });
      props.onSubmitted();
    } catch (e) {
      const code = e instanceof ClientApiError ? e.code : undefined;
      setState(code === "CONTRIBUTION_CONSENT_REQUIRED" ? { kind: "consent" } : { kind: "error", message: messageFor(code) });
    }
  }
  async function grantConsent() {
    try { await call("/v1/me/consents", { method: "POST", body: { purpose: "contribution_public", granted: true } }); await submit(); }
    catch (e) { setState({ kind: "error", message: messageFor(e instanceof ClientApiError ? e.code : undefined) }); }
  }

  if (state.kind === "done") {
    return (
      <section className="stack" aria-live="polite">
        <h2 style={{ fontSize: "var(--t-lg)" }}>Đã gửi báo cáo</h2>
        <p className="small">{state.corroborated ? "Đã có người khác báo cùng tình trạng, nên tình trạng này giờ được xác nhận." : "Báo cáo của bạn hiện là tín hiệu chưa xác minh. Khi có thêm một người khác cùng báo hoặc kiểm duyệt viên xác minh, tình trạng sẽ được xác nhận."}</p>
        <div className="row"><button type="button" className="btn btn-primary" onClick={() => { setChoice(null); setState({ kind: "idle" }); }}>Báo thêm</button><button type="button" className="btn btn-quiet" onClick={props.onClose}>Xong</button></div>
      </section>
    );
  }

  return (
    <section className="stack" aria-labelledby="rp-title">
      <div className="row" style={{ justifyContent: "space-between" }}><h2 id="rp-title" style={{ fontSize: "var(--t-lg)" }}>Bạn đang thấy gì?</h2><button type="button" className="btn btn-quiet btn-sm" onClick={props.onClose}>Đóng</button></div>
      <div className="segmented" role="group" aria-label="Loại tình trạng">
        <button type="button" aria-pressed={group === "ROAD"} onClick={() => { setGroup("ROAD"); setChoice(null); }}>Đường</button>
        <button type="button" aria-pressed={group === "WEATHER"} onClick={() => { setGroup("WEATHER"); setChoice(null); }}>Thời tiết</button>
        <button type="button" aria-pressed={group === "PLACE"} disabled={!props.placeId} onClick={() => { setGroup("PLACE"); setChoice(null); }}>{props.placeName ? `Tại ${props.placeName}` : "Tại địa điểm"}</button>
      </div>
      {group === "PLACE" && !props.placeId ? <p className="small muted">Chọn một địa điểm trên bản đồ trước.</p> : null}
      <div className="chips" role="group" aria-label="Tình trạng">
        {options.map((o) => <button key={o.domain + o.value} type="button" className="chip-btn" style={{ minHeight: 48 }} aria-pressed={choice === o} onClick={() => setChoice(o)}>{o.label}</button>)}
      </div>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 600 }}>Vị trí báo cáo</legend>
        <label className="check"><input type="radio" name="loc" checked={useGps && Boolean(props.fix)} disabled={!props.fix} onChange={() => setUseGps(true)} />Vị trí hiện tại của tôi {props.fix ? `(sai số ~${Math.round(props.fix.accuracy)} m)` : "(bấm nút định vị trên bản đồ trước)"}</label>
        <label className="check"><input type="radio" name="loc" checked={!useGps || !props.fix} onChange={() => setUseGps(false)} />Điểm ở giữa bản đồ</label>
        <p className="xsmall muted">Người khác chỉ thấy vị trí gần đúng trong ô khoảng 150 m, không thấy tên bạn.</p>
      </fieldset>
      <div className="field"><label htmlFor="rp-note">Ghi chú (không bắt buộc, chỉ bạn và kiểm duyệt viên thấy)</label><textarea id="rp-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {state.kind === "consent" ? (
        <div className="notice notice-warn stack" role="alert">
          <p>Để gửi báo cáo, bạn cần bật “Đóng góp công khai”: báo cáo của bạn sẽ được dùng để đối chứng tình trạng cho mọi người, với vị trí gần đúng và không kèm tên. Bạn có thể tắt bất cứ lúc nào trong Quyền riêng tư.</p>
          <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={() => void grantConsent()}>Bật và gửi báo cáo</button></div>
        </div>
      ) : null}
      {state.kind === "error" ? <div className="notice notice-error" role="alert">{state.message}</div> : null}
      <button type="button" className="btn btn-primary btn-lg" disabled={!choice || state.kind === "sending" || (group === "PLACE" && !props.placeId)} onClick={() => void submit()}>{state.kind === "sending" ? "Đang gửi…" : choice ? `Gửi: ${choice.label}` : "Chọn tình trạng"}</button>
    </section>
  );
}
