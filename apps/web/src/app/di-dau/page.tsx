import type { Metadata } from "next";
import { DecideFlow } from "@/components/decide-flow";

export const metadata: Metadata = {
  title: "Đi đâu bây giờ?",
  description: "Nói điều bạn muốn làm. Reality gợi ý vài nơi phù hợp ở Hà Nội kèm lý do, bằng chứng và những gì còn chưa rõ.",
  alternates: { canonical: "/di-dau" },
};

export default function DecidePage() {
  return (
    <div className="page-narrow stack-lg">
      <header className="stack">
        <h1>Đi đâu bây giờ?</h1>
        <p className="lede">Kể điều bạn muốn làm. Bạn sẽ nhận vài lựa chọn, mỗi lựa chọn có lý do, bằng chứng đi kèm và những điều còn chưa rõ.</p>
      </header>
      <DecideFlow />
    </div>
  );
}
