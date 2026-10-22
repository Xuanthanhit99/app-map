"use client";
import Link from "next/link";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";

export function PlaceActions({ placeId, slug, saved: initialSaved, signedIn }: { placeId: string; slug: string; saved: boolean; signedIn: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [watching, setWatching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const next = encodeURIComponent(`/dia-diem/${slug}`);
  async function toggleSave() {
    try {
      if (saved) await call(`/v1/me/saved-places/${placeId}`, { method: "DELETE" });
      else await call("/v1/me/saved-places", { method: "POST", body: { placeId } });
      setSaved(!saved); setMsg(saved ? "Đã bỏ lưu." : "Đã lưu địa điểm.");
    } catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  async function watch() {
    try {
      await call("/v1/me/watch-areas", { method: "POST", body: { kind: "PLACE", placeId, domains: ["PLACE_OPEN", "CROWD", "QUEUE", "PARKING", "ROAD"], minSeverity: "MINOR" } });
      setWatching(true); setMsg("Bạn sẽ nhận thông báo khi tình trạng tại đây thay đổi đáng kể.");
    } catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
  }
  return (
    <div className="stack">
      <div className="row">
        <Link className="btn btn-primary" href={`/hanh-trinh?to=${slug}`}>Chỉ đường</Link>
        {signedIn ? (
          <>
            <button type="button" className="btn btn-secondary" aria-pressed={saved} onClick={() => void toggleSave()}>{saved ? "Đã lưu" : "Lưu"}</button>
            <button type="button" className="btn btn-secondary" disabled={watching} onClick={() => void watch()}>{watching ? "Đang theo dõi" : "Theo dõi thay đổi"}</button>
          </>
        ) : <Link className="btn btn-secondary" href={`/dang-nhap?next=${next}`}>Đăng nhập để lưu và theo dõi</Link>}
        <Link className="btn btn-quiet" href={`/ban-do?place=${slug}&report=1`}>Báo thay đổi</Link>
      </div>
      {msg ? <p className="small" role="status">{msg}</p> : null}
    </div>
  );
}
