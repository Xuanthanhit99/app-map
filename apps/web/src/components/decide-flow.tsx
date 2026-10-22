"use client";
import Link from "next/link";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { distance } from "@/lib/format";
import { messageFor } from "@/lib/messages";
import type { DecideOption, DecideResponse } from "@/lib/types";
import { LOCATE_MESSAGES, locateOnce, type BrowserFix } from "./map/map-core";
import { StateChip } from "./state";

const QUICK = ["Uống cà phê yên tĩnh", "Đi dạo ngoài trời", "Ăn tối", "Chỗ chơi cho trẻ em", "Tránh mưa, ở trong nhà", "Tham quan bảo tàng"];
const TIMES = [{ v: 30, l: "30 phút" }, { v: 60, l: "1 giờ" }, { v: 120, l: "2 giờ" }, { v: 0, l: "Không giới hạn" }];
const MODES = [{ v: "WALKING", l: "Đi bộ" }, { v: "MOTORBIKE", l: "Xe máy" }, { v: "CYCLING", l: "Xe đạp" }, { v: "DRIVING", l: "Ô tô" }] as const;
const BASIS = { EVIDENCE: "bằng chứng", ASSUMPTION: "giả định", USER_INPUT: "theo yêu cầu của bạn", UNKNOWN: "chưa rõ" } as const;

export function DecideFlow() {
  const [intent, setIntent] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [mode, setMode] = useState<(typeof MODES)[number]["v"]>("MOTORBIKE");
  const [wheelchair, setWheelchair] = useState(false);
  const [fix, setFix] = useState<BrowserFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DecideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function useLocation() {
    setLocating(true); setLocMsg(null);
    try { setFix(await locateOnce()); } catch (e) { setLocMsg(LOCATE_MESSAGES[(e as Error).message] ?? null); } finally { setLocating(false); }
  }
  async function submit(e?: React.FormEvent, cats = categories) {
    e?.preventDefault();
    if (intent.trim().length < 2 && !cats.length) { setError("Hãy kể ngắn gọn điều bạn muốn làm."); return; }
    setBusy(true); setError(null);
    try {
      const r = await call<DecideResponse>("/v1/decide", { method: "POST", body: {
        intent: intent.trim() || "đi chơi", limit: 3, mode, wheelchair,
        ...(minutes ? { availableMinutes: minutes } : {}),
        ...(cats.length ? { categories: cats } : {}),
        ...(fix ? { origin: { latitude: fix.lat, longitude: fix.lng }, useLocation: true } : { areaId: "ha-noi" }),
      } });
      setResult(r);
      requestAnimationFrame(() => document.getElementById("decide-results")?.focus());
    } catch (err) { setError(messageFor(err instanceof ClientApiError ? err.code : undefined)); } finally { setBusy(false); }
  }

  return (
    <div className="stack-lg">
      <form className="decide-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="intent">Bạn muốn làm gì?</label>
          <input id="intent" className="input decide-input" value={intent} onChange={(e) => setIntent(e.target.value)} maxLength={200} placeholder="Ví dụ: tìm chỗ đọc sách yên tĩnh gần đây" />
          <div className="chips" aria-label="Gợi ý nhanh">{QUICK.map((q) => <button key={q} type="button" className="chip-btn" onClick={() => setIntent(q)}>{q}</button>)}</div>
        </div>
        <div className="field">
          <span className="label">Bạn đang ở đâu?</span>
          {fix ? <p className="small">Đang dùng vị trí hiện tại cho lần gợi ý này (sai số ~{Math.round(fix.accuracy)} m). <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFix(null)}>Bỏ dùng vị trí</button></p>
            : <div className="row"><button type="button" className="btn btn-secondary" onClick={() => void useLocation()} disabled={locating}>{locating ? "Đang định vị…" : "Dùng vị trí hiện tại"}</button><span className="small muted">Hoặc gợi ý trong khu vực Hà Nội (không tính khoảng cách).</span></div>}
          <span className="hint">Vị trí chỉ được gửi cho lần gợi ý này và không được lưu.</span>
          {locMsg ? <p className="small" role="status">{locMsg}</p> : null}
        </div>
        <div className="grid-2">
          <div className="field"><span className="label">Thời gian bạn có</span><div className="segmented" role="group" aria-label="Thời gian">{TIMES.map((t) => <button key={t.v} type="button" aria-pressed={minutes === t.v} onClick={() => setMinutes(t.v)}>{t.l}</button>)}</div></div>
          <div className="field"><span className="label">Đi bằng</span><div className="segmented" role="group" aria-label="Phương tiện">{MODES.map((m) => <button key={m.v} type="button" aria-pressed={mode === m.v} onClick={() => setMode(m.v)}>{m.l}</button>)}</div></div>
        </div>
        <label className="check"><input type="checkbox" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} />Cần lối đi cho xe lăn</label>
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
        <div><button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? "Đang cân nhắc…" : "Gợi ý cho tôi"}</button></div>
      </form>

      {result ? (
        <section id="decide-results" tabIndex={-1} aria-labelledby="res-h" className="stack-lg" style={{ outline: "none" }}>
          {result.status === "needs_clarification" ? (
            <div className="stack">
              <h2 id="res-h">Bạn muốn đến loại nơi nào?</h2>
              <p className="muted">{result.message}</p>
              <div className="chips">{result.suggestions.map((s) => <button key={s.id} type="button" className="chip-btn" onClick={() => { setCategories([s.id]); void submit(undefined, [s.id]); }}>{s.label}</button>)}</div>
            </div>
          ) : (
            <>
              <h2 id="res-h">{result.status === "ready" ? `${result.options.length} lựa chọn cho bạn` : "Chưa tìm được nơi phù hợp"}</h2>
              {result.status === "empty" ? <div className="empty"><h3>{result.reason === "ALL_CANDIDATES_EXCLUDED" ? "Các nơi tìm được đều không phù hợp lúc này" : "Không có địa điểm phù hợp trong phạm vi"}</h3><p>Hãy thử tăng thời gian, đổi phương tiện hoặc mô tả khác đi.</p></div> : null}
              <ol className="list-plain stack">{result.options.map((o) => <li key={o.place.id}><OptionCard o={o} fix={fix} mode={mode} /></li>)}</ol>
              {result.alternatives?.length ? <details><summary>Các lựa chọn khác ({result.alternatives.length})</summary><ul className="small">{result.alternatives.map((a) => <li key={a.place.id}><Link href={`/dia-diem/${a.place.slug}`}>{a.place.name}</Link> · {a.place.categoryLabel}{a.place.distanceMeters != null ? ` · ${distance(a.place.distanceMeters)}` : ""}</li>)}</ul></details> : null}
              {result.excluded.length ? <details><summary>Đã loại ({result.excluded.length})</summary><ul className="small">{result.excluded.map((x) => <li key={x.place.id}>{x.place.name}: {x.reason}</li>)}</ul></details> : null}
              <aside className="notice"><div className="stack"><strong className="small">Giới hạn dữ liệu</strong><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{result.coverage.map((c) => <li key={c}>{c}</li>)}</ul></div></aside>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function OptionCard({ o, fix, mode }: { o: DecideOption; fix: BrowserFix | null; mode: string }) {
  const from = fix ? `&from=${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}` : "";
  const travelMode = mode === "MOTORBIKE" ? "DRIVING" : mode;
  return (
    <article className="option" aria-labelledby={`opt-${o.place.id}`}>
      <div className="stack" style={{ gap: 4 }}>
        <span className="rank">Lựa chọn {o.rank}</span>
        <h3 id={`opt-${o.place.id}`}>{o.place.name}</h3>
        <p className="small muted">{o.place.categoryLabel}{o.place.distanceMeters != null ? ` · cách ${distance(o.place.distanceMeters)}` : ""}{o.estimate ? ` · khoảng ${o.estimate.travelMinutes} phút di chuyển (${o.estimate.label.toLowerCase()})` : ""}</p>
      </div>
      {o.states.length ? <div className="row">{o.states.map((s) => <StateChip key={s.subjectKey} state={s} />)}</div> : null}
      <div>
        <h4 className="small" style={{ marginBottom: 6 }}>Vì sao được gợi ý</h4>
        <ul className="factors">{o.factors.map((f, i) => (
          <li key={i}><span className="eff" data-sign={f.effect > 0 ? "pos" : f.effect < 0 ? "neg" : "zero"} aria-label={`${f.effect > 0 ? "cộng" : f.effect < 0 ? "trừ" : ""} ${Math.abs(f.effect)} điểm`}>{f.effect > 0 ? `+${f.effect}` : f.effect}</span>
            <span>{f.text} <span className="basis">({BASIS[f.basis]}{f.evidence?.nature === "FORECAST" ? ", dự báo" : ""})</span></span></li>
        ))}</ul>
      </div>
      {o.risks.length ? <div className="notice notice-warn small" role="note">{o.risks.join(". ")}.</div> : null}
      {o.unknowns.length ? <div className="unknowns"><strong>Chưa rõ:</strong> {o.unknowns.join("; ")}.</div> : null}
      <div className="row">
        <Link className="btn btn-primary" href={`/hanh-trinh?to=${o.place.slug}${from}&mode=${travelMode}`}>Bắt đầu hành trình</Link>
        <Link className="btn btn-secondary" href={`/dia-diem/${o.place.slug}`}>Xem địa điểm</Link>
      </div>
    </article>
  );
}
