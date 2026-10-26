"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { LOCATE_MESSAGES, locateOnce } from "@/components/map/map-core";

type Watch = { id: string; label: string; kind: string; radiusMeters: number; domains: string[]; minSeverity: string; active: boolean };
const SEV = { INFO: "Mọi thay đổi", MINOR: "Từ bất tiện nhỏ", SIGNIFICANT: "Từ ảnh hưởng đáng kể", SAFETY_CRITICAL: "Chỉ khi nguy hiểm" } as const;
const DOMAINS = [["ROAD", "Đường sá"], ["WEATHER", "Thời tiết"], ["PARKING", "Bãi xe"], ["CROWD", "Mức đông"], ["PLACE_OPEN", "Mở cửa"]] as const;

export default function WatchAreas() {
  const { data, error, loading, reload } = useApi<{ items: Watch[] }>("/v1/me/watch-areas");
  const [label, setLabel] = useState("Quanh nhà");
  const [radius, setRadius] = useState(800);
  const [domains, setDomains] = useState<string[]>(["ROAD", "WEATHER"]);
  const [sev, setSev] = useState<keyof typeof SEV>("SIGNIFICANT");
  const [msg, setMsg] = useState<string | null>(null);
  async function create() {
    setMsg("Đang định vị tâm khu vực…");
    try {
      const f = await locateOnce();
      await call("/v1/me/watch-areas", { method: "POST", body: { kind: "CIRCLE", label, latitude: f.lat, longitude: f.lng, radiusMeters: radius, domains, minSeverity: sev } });
      setMsg("Đã tạo khu vực theo dõi."); await reload();
    } catch (e) { setMsg(e instanceof ClientApiError ? messageFor(e.code) : LOCATE_MESSAGES[(e as Error).message] ?? messageFor(undefined)); }
  }
  return (
    <section className="stack-lg" aria-labelledby="h">
      <div className="stack"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Khu vực theo dõi</h1><p className="muted">Bạn chỉ nhận thông báo khi tình trạng thay đổi đáng kể theo ngưỡng bạn chọn. Mỗi khu vực có thời gian chờ 30 phút để tránh làm phiền.</p></div>
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : data?.items.length ? (
        <ul className="list-plain stack">{data.items.map((w) => (
          <li key={w.id} className="panel panel-tight row" style={{ justifyContent: "space-between" }}>
            <div><strong>{w.label}</strong><p className="small muted">{w.kind === "CIRCLE" ? `Bán kính ${w.radiusMeters} m` : w.kind === "PLACE" ? "Địa điểm" : "Tuyến đường"} · {w.domains.map((d) => DOMAINS.find((x) => x[0] === d)?.[1] ?? d).join(", ")} · {SEV[w.minSeverity as keyof typeof SEV]}</p></div>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={w.active} onClick={async () => { await call(`/v1/me/watch-areas/${w.id}`, { method: "PATCH", body: { active: !w.active } }); await reload(); }}>{w.active ? "Tạm dừng" : "Bật lại"}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await call(`/v1/me/watch-areas/${w.id}`, { method: "DELETE" }); await reload(); }}>Xóa</button>
            </div>
          </li>))}</ul>
      ) : <div className="empty"><h3>Chưa theo dõi khu vực nào</h3><p>Tạo một khu vực quanh vị trí hiện tại, hoặc chọn “Theo dõi thay đổi” trên trang một địa điểm.</p></div>}
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); void create(); }} aria-labelledby="new-h">
        <h2 id="new-h">Theo dõi quanh vị trí hiện tại</h2>
        <div className="field"><label htmlFor="w-label">Tên</label><input id="w-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required /></div>
        <div className="field"><label htmlFor="w-r">Bán kính: {radius} m</label><input id="w-r" type="range" min={200} max={3000} step={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Theo dõi</legend><div className="chips">{DOMAINS.map(([d, l]) => <button key={d} type="button" className="chip-btn" aria-pressed={domains.includes(d)} onClick={() => setDomains(domains.includes(d) ? domains.filter((x) => x !== d) : [...domains, d])}>{l}</button>)}</div></fieldset>
        <div className="field"><label htmlFor="w-sev">Báo cho tôi</label><select id="w-sev" className="input" value={sev} onChange={(e) => setSev(e.target.value as keyof typeof SEV)}>{Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {msg ? <p className="small" role="status">{msg}</p> : null}
        <div><button className="btn btn-primary" type="submit" disabled={!domains.length}>Tạo khu vực theo dõi</button></div>
      </form>
    </section>
  );
}
