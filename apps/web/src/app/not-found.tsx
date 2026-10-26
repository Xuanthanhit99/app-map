import Link from "next/link";
export default function NotFound() {
  return <div className="page-narrow stack"><h1>Không tìm thấy trang này</h1><p className="muted">Đường dẫn có thể đã thay đổi, hoặc địa điểm không còn trong dữ liệu.</p><div className="row"><Link className="btn btn-primary" href="/ban-do">Mở bản đồ</Link><Link className="btn btn-secondary" href="/">Về trang chủ</Link></div></div>;
}
