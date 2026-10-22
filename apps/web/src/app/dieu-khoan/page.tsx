import type { Metadata } from "next";
export const metadata: Metadata = { title: "Điều khoản sử dụng", alternates: { canonical: "/dieu-khoan" } };
export default function Terms() {
  return (
    <article className="page-narrow prose stack">
      <h1>Điều khoản sử dụng</h1>
      <p className="small muted">Bản nháp kỹ thuật 2026-10-22, cần chủ sở hữu và tư vấn pháp lý xem xét trước khi phát hành.</p>
      <h2>Thông tin chỉ để tham khảo</h2>
      <p>Reality hiển thị tình trạng dựa trên bằng chứng có sẵn và nói rõ khi chưa rõ. Luôn tuân thủ biển báo, hướng dẫn của cơ quan chức năng và quan sát thực tế. Không dùng ứng dụng khi đang điều khiển phương tiện ngoài các thao tác một chạm được thiết kế cho lúc di chuyển.</p>
      <h2>Đóng góp của bạn</h2>
      <p>Bạn chỉ báo điều mình trực tiếp thấy. Báo cáo sai lệch có chủ ý, spam hoặc nội dung xâm phạm người khác có thể bị từ chối và tài khoản có thể bị tạm khóa. Bạn cho phép Reality dùng báo cáo (không kèm danh tính) để đối chứng tình trạng cho mọi người.</p>
      <h2>Dữ liệu bên thứ ba</h2>
      <p>Dữ liệu bản đồ © OpenStreetMap contributors theo giấy phép ODbL. Dữ liệu thời tiết từ Open-Meteo.com theo CC BY 4.0.</p>
    </article>
  );
}
