"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import type { Journey, Place } from "@/lib/types";
import { LOCATE_MESSAGES, locateOnce } from "./map/map-core";

type Dest = { id: string; slug: string; name: string; coordinate: [number, number] };

export function JourneyPlanner(props: { signedIn: boolean; initialDestination: Dest | null; initialOrigin: { lat: number; lng: number } | null; initialMode: "DRIVING" | "WALKING" | "CYCLING" }) {
  const router = useRouter();
  const [dest, setDest] = useState<Dest | null>(props.initialDestination);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [origin, setOrigin] = useState(props.initialOrigin);
  const [originMsg, setOriginMsg] = useState<string | null>(null);
  const [mode, setMode] = useState(props.initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => { call<{ items: Place[] }>(`/v1/places?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: c.signal }).then((r) => setResults(r.items)).catch(() => undefined); }, 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);

  async function locate() {
    setOriginMsg("Đang định vị…");
    try { const f = await locateOnce(); setOrigin({ lat: f.lat, lng: f.lng }); setOriginMsg(f.accuracy > 150 ? `Sai số khoảng ${Math.round(f.accuracy)} m.` : null); }
    catch (e) { setOriginMsg(LOCATE_MESSAGES[(e as Error).message] ?? null); }
  }
  async function plan() {
    if (!dest || !origin) return;
    setBusy(true); setError(null);
    try {
      const r = await call<{ journey: Journey; routing: string }>("/v1/journeys", { method: "POST", body: { origin: { latitude: origin.lat, longitude: origin.lng }, destinationPlaceId: dest.id, mode } });
      router.push(`/hanh-trinh/${r.journey.id}`);
    } catch (e) { setError(messageFor(e instanceof ClientApiError ? e.code : undefined)); setBusy(false); }
  }

  return (
    <div className="panel stack">
      <div className="field">
        <span className="label">Điểm đến</span>
        {dest ? <div className="row"><strong>{dest.name}</strong><button type="button" className="btn btn-quiet btn-sm" onClick={() => setDest(null)}>Đổi</button></div> : (
          <>
            <label htmlFor="dest-q" className="visually-hidden">Tìm điểm đến</label>
            <input id="dest-q" className="input" placeholder="Tìm theo tên địa điểm" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length ? <ul className="list-plain">{results.map((p) => <li key={p.id}><button type="button" className="place-row" onClick={() => { setDest({ id: p.id, slug: p.slug, name: p.name, coordinate: p.coordinate }); setQ(""); }}><span><span className="n">{p.name}</span><br /><span className="c">{p.categoryLabel}{p.address ? ` · ${p.address}` : ""}</span></span></button></li>)}</ul>
              : q.trim().length >= 2 ? <p className="small muted">Không tìm thấy địa điểm nào khớp.</p> : null}
          </>
        )}
      </div>
      <div className="field">
        <span className="label">Xuất phát</span>
        {origin ? <p className="small">Từ vị trí đã chọn ({origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}). <button type="button" className="btn btn-quiet btn-sm" onClick={() => void locate()}>Cập nhật vị trí</button></p>
          : <div><button type="button" className="btn btn-secondary" onClick={() => void locate()}>Dùng vị trí hiện tại</button></div>}
        {originMsg ? <p className="small" role="status">{originMsg}</p> : null}
      </div>
      <div className="field"><span className="label">Phương tiện</span>
        <div className="segmented" role="group" aria-label="Phương tiện">{(["DRIVING", "WALKING", "CYCLING"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "DRIVING" ? "Ô tô / xe máy" : m === "WALKING" ? "Đi bộ" : "Xe đạp"}</button>)}</div>
      </div>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      {props.signedIn ? <div><button type="button" className="btn btn-primary btn-lg" disabled={!dest || !origin || busy} onClick={() => void plan()}>{busy ? "Đang tính tuyến…" : "Tính tuyến đường"}</button></div>
        : <div className="notice"><span>Đăng nhập để lưu và theo dõi hành trình. <Link href="/dang-nhap?next=/hanh-trinh">Đăng nhập</Link></span></div>}
    </div>
  );
}
