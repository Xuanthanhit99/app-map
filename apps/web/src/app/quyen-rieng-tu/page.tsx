import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Chính sách quyền riêng tư", description: "Reality thu thập gì, vì sao, giữ trong bao lâu và quyền của bạn.", alternates: { canonical: "/quyen-rieng-tu" } };
export default function PrivacyPolicy() {
  return (
    <article className="page-narrow prose stack">
      <h1>Chính sách quyền riêng tư</h1>
      <p className="small muted">Phiên bản 2026-10-22. Bản nháp kỹ thuật, cần chủ sở hữu và tư vấn pháp lý xem xét trước khi phát hành chính thức (tham chiếu Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân).</p>
      <h2>Chúng tôi thu thập gì</h2>
      <ul>
        <li>Tài khoản: email, tên hiển thị, mật khẩu (chỉ lưu dạng băm scrypt).</li>
        <li>Báo cáo bạn gửi: loại tình trạng, thời điểm, vị trí bạn gửi và ghi chú tùy chọn.</li>
        <li>Hành trình bạn lưu: điểm đi, điểm đến và tuyến từ nhà cung cấp định tuyến. Không lưu vết GPS.</li>
        <li>Tùy chọn, địa điểm đã lưu, khu vực theo dõi, lịch sử đồng ý.</li>
      </ul>
      <h2>Chúng tôi không làm gì</h2>
      <ul><li>Không theo dõi vị trí nền trên web.</li><li>Không công bố vị trí chính xác hay danh tính người báo cáo.</li><li>Không bán dữ liệu cá nhân.</li><li>Không suy ra vị trí từ địa chỉ IP để gợi ý.</li></ul>
      <h2>Thời gian lưu giữ</h2>
      <ul>
        <li>Phiên đăng nhập: xóa 30 ngày sau khi hết hạn hoặc bị thu hồi.</li>
        <li>Vị trí chính xác của báo cáo: làm mờ về ô ~150 m và xóa ghi chú 90 ngày sau khi báo cáo hết hiệu lực.</li>
        <li>Tuyến đường của hành trình: xóa 180 ngày sau khi hành trình kết thúc.</li>
        <li>Thông báo đã đọc: xóa sau 90 ngày; mọi thông báo sau 365 ngày.</li>
        <li>Nhật ký kiểm toán (không chứa vị trí, mật khẩu hay email): 365 ngày.</li>
      </ul>
      <h2>Quyền của bạn</h2>
      <p>Bạn có thể bật hoặc tắt từng mục đích sử dụng, tải toàn bộ dữ liệu và xóa tài khoản tại <Link href="/tai-khoan/quyen-rieng-tu">Tài khoản → Quyền riêng tư</Link>. Khi xóa tài khoản, báo cáo đã gửi được giữ cho lịch sử an toàn nhưng tách khỏi bạn và xóa ghi chú.</p>
    </article>
  );
}
