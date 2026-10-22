"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <div className="page-narrow stack"><h1>Không tải được trang</h1><p className="muted">Máy chủ dữ liệu không phản hồi hoặc kết nối bị gián đoạn. Dữ liệu chưa thay đổi gì.</p><div><button type="button" className="btn btn-primary" onClick={reset}>Thử lại</button></div></div>;
}
