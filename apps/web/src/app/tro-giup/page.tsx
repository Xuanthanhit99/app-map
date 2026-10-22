import type { Metadata } from "next";
export const metadata: Metadata = { title: "Trợ giúp", description: "Câu hỏi thường gặp về Reality: tình trạng được xác nhận thế nào, báo cáo, quyền riêng tư và hành trình.", alternates: { canonical: "/tro-giup" } };
const FAQ = [
  ["Vì sao nhiều nơi hiện “Chưa rõ”?", "Vì Reality chỉ khẳng định điều có bằng chứng gần đây. Chưa rõ nghĩa là chưa có ai báo hoặc nguồn nào xác nhận, không có nghĩa là bình thường hay an toàn."],
  ["Báo cáo của tôi khi nào được tính là xác nhận?", "Khi có thêm một người khác cùng báo điều tương tự ở gần đó, hoặc khi kiểm duyệt viên xác minh. Trước đó báo cáo được hiển thị là chưa xác minh."],
  ["Người khác có thấy vị trí chính xác của tôi không?", "Không. Báo cáo chỉ hiển thị công khai trong một ô khoảng 150 m và không kèm tên bạn. Vị trí dùng cho gợi ý hay hành trình không được lưu."],
  ["Vì sao tôi không bắt đầu được hành trình?", "Dẫn đường chỉ bắt đầu khi có tuyến hợp lệ từ nhà cung cấp định tuyến và tuyến còn mới (dưới 15 phút). Nếu tuyến đã cũ, hãy tính lại tuyến."],
  ["Thời gian di chuyển trong gợi ý có chính xác không?", "Đó là ước tính theo đường chim bay và tốc độ trung bình, được ghi rõ là ước tính. Thời gian khi lên hành trình đến từ nhà cung cấp định tuyến."],
  ["Làm sao xóa dữ liệu của tôi?", "Vào Tài khoản → Quyền riêng tư để tải về toàn bộ dữ liệu hoặc xóa vĩnh viễn tài khoản."],
] as const;
export default function Help() {
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return (
    <div className="page-narrow stack-lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <h1>Trợ giúp</h1>
      <div className="stack">{FAQ.map(([q, a]) => <details key={q} className="panel panel-tight"><summary><strong>{q}</strong></summary><p style={{ marginTop: 8 }} className="muted">{a}</p></details>)}</div>
    </div>
  );
}
