import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Đăng nhập", robots: { index: false, follow: true } };
export default function Login() {
  return <div className="auth-card stack"><h1 style={{ fontSize: "var(--t-2xl)" }}>Đăng nhập</h1><Suspense><AuthForm mode="login" /></Suspense></div>;
}
