import type { Metadata } from "next";
import { LazyMapExplorer } from "@/components/map/lazy";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Bản đồ tình trạng Hà Nội",
  description: "Bản đồ địa điểm, tình trạng đường sá và thời tiết ở Hà Nội với nguồn, độ mới và độ tin cậy cho từng tín hiệu.",
  alternates: { canonical: "/ban-do" },
};

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const at = one("at")?.split(",").map(Number);
  const user = await currentUser();
  return (
    <>
      <h1 className="visually-hidden">Bản đồ tình trạng</h1>
      <LazyMapExplorer
        signedIn={Boolean(user)}
        {...(one("q") ? { initialQuery: one("q")!.slice(0, 120) } : {})}
        {...(at && at.length === 2 && at.every(Number.isFinite) ? { initialAt: [at[0]!, at[1]!] as [number, number] } : {})}
        {...(one("place") ? { initialPlace: one("place")! } : {})}
        openReport={one("report") === "1"}
      />
    </>
  );
}
