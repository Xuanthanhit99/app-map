import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Giới thiệu", description: "Reality là mạng lưới trạng thái thế giới thực: biết điều gì đang xảy ra, quyết định, lên đường và đóng góp.", alternates: { canonical: "/gioi-thieu" } };
export default function About() {
  return (
    <article className="page-narrow prose stack">
      <h1>Giới thiệu Reality</h1>
      <p className="lede">Bản đồ cho biết đường đi. Reality cố gắng cho biết điều gì đang thật sự xảy ra trên con đường đó.</p>
      <p>Mỗi ngày ở Hà Nội, tình trạng thật thay đổi nhanh hơn mọi bản đồ: một đoạn ngập sau cơn mưa, một bãi xe kín chỗ, một quán đóng cửa bất ngờ. Reality gom các tín hiệu đó, đối chứng chúng, và cho bạn biết rõ đâu là điều đã được xác nhận, đâu là điều còn chưa rõ.</p>
      <h2>Vòng lặp của Reality</h2>
      <p>Thực tế → Ngữ cảnh → Quyết định → Hành trình → Câu chuyện → Đóng góp → Thực tế. Bạn xem tình trạng quanh mình, chọn nơi để đi, lên đường với các cảnh báo đã xác minh dọc tuyến, và khi tới nơi có thể báo lại điều bạn thấy cho người sau.</p>
      <h2>Những nguyên tắc không đổi</h2>
      <ul>
        <li>Chưa rõ không bao giờ được hiểu là an toàn.</li>
        <li>Một báo cáo đơn lẻ không tự trở thành sự thật.</li>
        <li>Mọi tình trạng đều đi kèm nguồn, thời điểm và độ tin cậy.</li>
        <li>Không theo dõi ai một cách âm thầm. Mọi quyền đều do bạn bật và tắt.</li>
      </ul>
      <p><Link href="/du-lieu">Xem nguồn dữ liệu và giới hạn hiện tại</Link>.</p>
    </article>
  );
}
