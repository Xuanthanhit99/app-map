import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="cols">
        <div className="stack">
          <p><strong>Reality</strong> cho bạn biết điều gì đang thật sự xảy ra quanh mình — và nói rõ khi chưa biết.</p>
          <p className="xsmall">Dữ liệu bản đồ © OpenStreetMap contributors (ODbL). Thời tiết: Open-Meteo.com (CC BY 4.0), là dự báo mô hình.</p>
        </div>
        <div><h2>Khám phá</h2><ul><li><Link href="/ban-do">Bản đồ</Link></li><li><Link href="/di-dau">Đi đâu bây giờ?</Link></li><li><Link href="/khu-vuc/ha-noi">Hà Nội</Link></li><li><Link href="/cau-chuyen">Câu chuyện</Link></li></ul></div>
        <div><h2>Tin cậy</h2><ul><li><Link href="/du-lieu">Nguồn dữ liệu</Link></li><li><Link href="/tro-giup">Trợ giúp</Link></li><li><Link href="/gioi-thieu">Giới thiệu</Link></li></ul></div>
        <div><h2>Pháp lý</h2><ul><li><Link href="/quyen-rieng-tu">Quyền riêng tư</Link></li><li><Link href="/dieu-khoan">Điều khoản</Link></li></ul></div>
      </div>
    </footer>
  );
}
