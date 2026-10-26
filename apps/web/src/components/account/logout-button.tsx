"use client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await fetch("/api/session/logout", { method: "POST" }); router.replace("/"); router.refresh(); }}>Đăng xuất</button>;
}
