"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { call, ClientApiError } from "@/lib/client-api";
import { messageFor } from "@/lib/messages";

function NewStoryForm() {
  const router = useRouter();
  const placeId = useSearchParams().get("place");
  const [sources, setSources] = useState([{ title: "", url: "" }]);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await call("/v1/stories", { method: "POST", body: { title: f.get("title"), summary: f.get("summary"), body: f.get("body"),
        ...(placeId && /^[0-9a-f-]{36}$/.test(placeId) ? { placeId } : {}), sources: sources.filter((s) => s.title.trim() && s.url.trim()) } });
      router.push("/tai-khoan/cau-chuyen");
    } catch (err) { setError(messageFor(err instanceof ClientApiError ? err.code : undefined)); }
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="field"><label htmlFor="t">Tiêu đề</label><input id="t" name="title" className="input" required minLength={4} maxLength={160} /></div>
      <div className="field"><label htmlFor="s">Tóm tắt</label><input id="s" name="summary" className="input" required minLength={10} maxLength={300} /></div>
      <div className="field"><label htmlFor="b">Nội dung</label><textarea id="b" name="body" className="input" required minLength={40} maxLength={20000} style={{ minHeight: 240 }} /></div>
      <fieldset className="stack" style={{ border: 0, padding: 0 }}><legend className="label">Nguồn tham khảo (bắt buộc khi gửi duyệt)</legend>
        {sources.map((s, i) => <div key={i} className="grid-2"><input className="input" aria-label={`Tên nguồn ${i + 1}`} placeholder="Tên nguồn" value={s.title} onChange={(e) => setSources(sources.map((x, k) => k === i ? { ...x, title: e.target.value } : x))} /><input className="input" type="url" aria-label={`Đường dẫn nguồn ${i + 1}`} placeholder="https://" value={s.url} onChange={(e) => setSources(sources.map((x, k) => k === i ? { ...x, url: e.target.value } : x))} /></div>)}
        {sources.length < 10 ? <div><button type="button" className="btn btn-quiet btn-sm" onClick={() => setSources([...sources, { title: "", url: "" }])}>Thêm nguồn</button></div> : null}
      </fieldset>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      <div><button className="btn btn-primary" type="submit">Lưu bản nháp</button></div>
    </form>
  );
}
export default function NewStory() {
  return <section className="stack" aria-labelledby="h"><h1 id="h" style={{ fontSize: "var(--t-2xl)" }}>Viết câu chuyện</h1><Suspense><NewStoryForm /></Suspense></section>;
}
