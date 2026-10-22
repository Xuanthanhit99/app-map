"use client";
import { useEffect, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";
import { AccountSecurity } from "@/components/account-security";

type Prefs = { travelMode: string; accessibilityNeeds: string[]; preferredCategories: string[]; notifyMinSeverity: string; quietHours: { startHour: number; endHour: number } | null };
const ACCESS = [["WHEELCHAIR", "Xe lăn"], ["STEP_FREE", "Không bậc thang"], ["LOW_VISION", "Thị lực kém"], ["HEARING", "Khiếm thính"], ["REDUCED_MOBILITY", "Đi lại khó khăn"]] as const;
const CATS = [["cafe", "Cà phê"], ["restaurant", "Nhà hàng"], ["park", "Công viên"], ["museum", "Bảo tàng"], ["attraction", "Điểm tham quan"], ["library", "Thư viện"], ["playground", "Sân chơi"], ["market", "Chợ"]] as const;

export default function Settings() {
  const { data, error, loading, reload } = useApi<Prefs>("/v1/me/preferences");
  const me = useApi<{ user: { displayName: string } }>("/v1/me");
  const [p, setP] = useState<Prefs | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (data) setP(data); }, [data]);
  useEffect(() => { if (me.data) setName(me.data.user.displayName); }, [me.data]);
  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorNote message={error ?? "Không tải được tùy chọn."} retry={reload} />;
  const toggle = (k: "accessibilityNeeds" | "preferredCategories", v: string) => setP({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call("/v1/me", { method: "PATCH", body: { displayName: name } });
      await call("/v1/me/preferences", { method: "PUT", body: { travelMode: p!.travelMode, accessibilityNeeds: p!.accessibilityNeeds, preferredCategories: p!.preferredCategories, notifyMinSeverity: p!.notifyMinSeverity, quietHours: p!.quietHours } });
      setMsg("Đã lưu tùy chọn.");
    } catch (err) { setMsg(messageFor(err instanceof ClientApiError ? err.code : undefined)); }
  }
  return (
    <div className="stack-lg">
    <form className="stack-lg" onSubmit={save} aria-labelledby="h">
      <div className="stack"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Tùy chọn</h1><p className="muted">Tùy chọn chỉ được dùng để cá nhân hóa gợi ý khi bạn bật “Cá nhân hóa theo ngữ cảnh” trong Quyền riêng tư. Bạn có thể đổi hoặc xóa bất cứ lúc nào.</p></div>
      <div className="panel stack">
        <div className="field"><label htmlFor="name">Tên hiển thị</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></div>
        <div className="field"><label htmlFor="mode">Phương tiện thường dùng</label><select id="mode" className="input" value={p.travelMode} onChange={(e) => setP({ ...p, travelMode: e.target.value })}><option value="MOTORBIKE">Xe máy</option><option value="DRIVING">Ô tô</option><option value="WALKING">Đi bộ</option><option value="CYCLING">Xe đạp</option></select></div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Nhu cầu tiếp cận</legend><div className="chips">{ACCESS.map(([k, l]) => <button key={k} type="button" className="chip-btn" aria-pressed={p.accessibilityNeeds.includes(k)} onClick={() => toggle("accessibilityNeeds", k)}>{l}</button>)}</div></fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0 }}><legend className="label">Loại nơi bạn thích</legend><div className="chips">{CATS.map(([k, l]) => <button key={k} type="button" className="chip-btn" aria-pressed={p.preferredCategories.includes(k)} onClick={() => toggle("preferredCategories", k)}>{l}</button>)}</div></fieldset>
        <div className="field"><label htmlFor="sev">Mức thông báo mặc định</label><select id="sev" className="input" value={p.notifyMinSeverity} onChange={(e) => setP({ ...p, notifyMinSeverity: e.target.value })}><option value="INFO">Mọi thay đổi</option><option value="MINOR">Từ bất tiện nhỏ</option><option value="SIGNIFICANT">Từ ảnh hưởng đáng kể</option><option value="SAFETY_CRITICAL">Chỉ khi nguy hiểm</option></select></div>
        <label className="check"><input type="checkbox" checked={Boolean(p.quietHours)} onChange={(e) => setP({ ...p, quietHours: e.target.checked ? { startHour: 22, endHour: 24 } : null })} />Giờ yên tĩnh 22:00–24:00 (trừ cảnh báo nguy hiểm)</label>
      </div>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      <div><button className="btn btn-primary" type="submit">Lưu tùy chọn</button></div>
    </form>
    <AccountSecurity />
    </div>
  );
}
