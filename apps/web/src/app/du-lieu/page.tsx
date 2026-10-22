import type { Metadata } from "next";
import { api } from "@/lib/server-api";

export const revalidate = 600;
export const metadata: Metadata = { title: "Nguồn dữ liệu và giới hạn", description: "Reality lấy dữ liệu từ đâu, giấy phép, mức độ tin cậy và những gì hiện chưa có.", alternates: { canonical: "/du-lieu" } };
type Source = { id: string; name: string; kind: string; license: string; attribution: string; commercialUse: string; updateFrequency: string; nature: string; enabled: boolean; notes: string | null };
const NATURE: Record<string, string> = { STATIC_REFERENCE: "Dữ liệu tham chiếu (không phải trạng thái trực tiếp)", FORECAST: "Dự báo mô hình", COMMUNITY_REPORT: "Báo cáo cộng đồng", LIVE_OBSERVATION: "Quan sát trực tiếp", MODEL_ESTIMATE: "Ước tính" };

export default async function DataPage() {
  const sources = await api<{ items: Source[] }>("/v1/sources", { revalidate: 600 }).then((r) => r.items).catch(() => null);
  return (
    <div className="page-narrow stack-lg">
      <header className="stack"><h1>Nguồn dữ liệu và giới hạn</h1><p className="lede">Reality chỉ khẳng định điều có bằng chứng. Đây là các nguồn hiện dùng, và những gì chúng ta chưa có.</p></header>
      <section className="prose stack">
        <h2>Những gì chưa có</h2>
        <ul>
          <li>Chưa có nguồn giao thông hoặc ngập lụt trực tiếp được cấp phép cho Hà Nội. Tình trạng đường chỉ đến từ báo cáo cộng đồng đã đối chứng hoặc kiểm duyệt viên xác minh.</li>
          <li>Chưa có nguồn trực tiếp về chỗ trống bãi xe, mức đông hay trạng thái mở cửa từ doanh nghiệp. Giờ mở cửa trên trang địa điểm là lịch công bố, không phải trạng thái lúc này.</li>
          <li>Chưa có dữ liệu xe buýt hay sự kiện.</li>
          <li>Thời tiết là dự báo mô hình, không phải đo đạc tại chỗ.</li>
        </ul>
        <h2>Một tình trạng được xác nhận khi nào</h2>
        <p>Khi có nguồn đủ tin cậy (ví dụ dự báo thời tiết) hoặc kiểm duyệt viên xác minh, hoặc ít nhất hai người khác nhau cùng báo một điều và không có báo cáo trái ngược đáng kể. Một báo cáo đơn lẻ luôn được hiển thị là “chưa xác minh”. Khi các nguồn mâu thuẫn, Reality hiển thị “mâu thuẫn” chứ không chọn bên.</p>
        <h2>Độ mới</h2>
        <p>Mỗi loại thông tin có ngưỡng riêng. Ví dụ tình trạng đường được coi là mới trong 15 phút, đang cũ dần tới 45 phút, sau đó “có thể đã thay đổi”. Báo cáo đường hết hiệu lực sau 90 phút.</p>
      </section>
      <section aria-labelledby="src-h" className="stack">
        <h2 id="src-h">Nguồn đang dùng</h2>
        {!sources ? <div className="notice notice-error">Không tải được danh sách nguồn.</div> : (
          <div className="table-wrap"><table className="data"><thead><tr><th>Nguồn</th><th>Loại dữ liệu</th><th>Giấy phép</th><th>Trạng thái</th></tr></thead><tbody>
            {sources.map((s) => <tr key={s.id}><td><strong>{s.name}</strong><div className="xsmall muted">{s.attribution}</div>{s.notes ? <div className="xsmall muted">{s.notes}</div> : null}</td><td>{NATURE[s.nature] ?? s.nature}<div className="xsmall muted">{s.updateFrequency}</div></td><td>{s.license}{s.commercialUse !== "ALLOWED" ? <div className="xsmall muted">Dùng thương mại: {s.commercialUse === "RESTRICTED" ? "có hạn chế" : s.commercialUse === "PROHIBITED" ? "không cho phép" : "chưa xác minh"}</div> : null}</td><td><span className="badge" data-tone={s.enabled ? "ok" : ""}>{s.enabled ? "Đang dùng" : "Chưa bật"}</span></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}
