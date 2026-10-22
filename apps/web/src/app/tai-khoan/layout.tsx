import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashNav } from "@/components/dash-nav";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Tài khoản", robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUser())) redirect("/dang-nhap?next=/tai-khoan");
  return (
    <div className="dash">
      <DashNav label="Mục tài khoản" items={[
        { href: "/tai-khoan", label: "Tổng quan" },
        { group: "Của tôi" },
        { href: "/tai-khoan/da-luu", label: "Địa điểm đã lưu" }, { href: "/tai-khoan/theo-doi", label: "Khu vực theo dõi" },
        { href: "/tai-khoan/thong-bao", label: "Thông báo" }, { href: "/hanh-trinh", label: "Hành trình" },
        { href: "/tai-khoan/bao-cao", label: "Báo cáo đã gửi" }, { href: "/tai-khoan/cau-chuyen", label: "Câu chuyện" },
        { group: "Thiết lập" },
        { href: "/tai-khoan/cai-dat", label: "Tùy chọn" }, { href: "/tai-khoan/quyen-rieng-tu", label: "Quyền riêng tư" },
      ]} />
      <div className="stack-lg" style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
