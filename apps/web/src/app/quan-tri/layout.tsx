import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashNav } from "@/components/dash-nav";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Quản trị", robots: { index: false, follow: false } };

/** UI gate only; every admin API call is independently role-checked on the server. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/dang-nhap?next=/quan-tri");
  if (user.role === "user") notFound();
  return (
    <div className="dash" style={{ maxWidth: 1440 }}>
      <DashNav label="Mục quản trị" items={[
        { href: "/quan-tri", label: "Tổng quan vận hành" },
        { group: "Tin cậy & kiểm duyệt" },
        { href: "/quan-tri/bao-cao", label: "Báo cáo cần duyệt" }, { href: "/quan-tri/xung-dot", label: "Xung đột" },
        { href: "/quan-tri/su-co", label: "Sự cố" }, { href: "/quan-tri/cau-chuyen", label: "Câu chuyện" }, { href: "/quan-tri/nguoi-dung", label: "Người dùng" },
        { group: "Dữ liệu" },
        { href: "/quan-tri/nguon", label: "Nguồn dữ liệu" }, { href: "/quan-tri/nap-du-lieu", label: "Lượt nạp dữ liệu" }, { href: "/quan-tri/san-sang", label: "Độ sẵn sàng dữ liệu" },
        { group: "Hệ thống" },
        { href: "/quan-tri/co-tinh-nang", label: "Cờ tính năng" }, ...(user.role === "admin" ? [{ href: "/quan-tri/nhat-ky", label: "Nhật ký kiểm toán" }] : []),
      ]} />
      <div className="stack-lg" style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
