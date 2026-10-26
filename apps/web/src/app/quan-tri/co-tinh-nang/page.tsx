"use client";
import { useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";
import { useApi } from "@/lib/use-api";
import { ErrorNote, Loading } from "@/components/dash-nav";

type F = { key: string; enabled: boolean; description: string };
export default function Flags() {
  const { data, error, loading, reload } = useApi<{ items: F[] }>("/v1/admin/flags");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="stack" aria-labelledby="h">
      <h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Cờ tính năng</h1>
      <p className="small muted">Chỉ quản trị viên được bật/tắt. Một số cờ còn cần cấu hình nhà cung cấp (khóa API) mới hoạt động.</p>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      {loading && !data ? <Loading /> : error ? <ErrorNote message={error} retry={reload} /> : (
        <ul className="list-plain stack">{data!.items.map((f) => (
          <li key={f.key} className="panel panel-tight row" style={{ justifyContent: "space-between" }}>
            <div><strong>{f.key}</strong><p className="small muted">{f.description}</p></div>
            <button type="button" className="btn btn-secondary btn-sm" aria-pressed={f.enabled} onClick={async () => { try { await call(`/v1/admin/flags/${f.key}`, { method: "PATCH", body: { enabled: !f.enabled } }); await reload(); } catch (e) { setMsg(messageFor(e instanceof ClientApiError ? e.code : undefined)); } }}>{f.enabled ? "Đang bật — tắt" : "Đang tắt — bật"}</button>
          </li>))}</ul>
      )}
    </section>
  );
}
