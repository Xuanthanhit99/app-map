import { Link } from "expo-router";
import { Card, H, P, Screen } from "../src/ui/kit";
/** Unknown deep links land here instead of a blank screen. */
export default function NotFound() {
  return (
    <Screen title="Không tìm thấy" eyebrow="LIÊN KẾT">
      <Card><H>Liên kết này không mở được trong ứng dụng</H><P muted small>Liên kết có thể đã cũ hoặc chỉ dùng được trên trang web.</P><Link href="/" style={{ color: "#F2B544", fontWeight: "700" }}>Về trang chính</Link></Card>
    </Screen>
  );
}
