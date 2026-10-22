import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JourneyView } from "@/components/journey-view";
import { ApiFailure, api } from "@/lib/server-api";
import { currentUser } from "@/lib/session";
import type { Impact, Journey } from "@/lib/types";

export const metadata: Metadata = { title: "Hành trình của bạn", robots: { index: false, follow: false } };

export default async function JourneyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await currentUser())) redirect(`/dang-nhap?next=/hanh-trinh/${id}`);
  try {
    const r = await api<{ journey: Journey; impact: Impact }>(`/v1/journeys/${encodeURIComponent(id)}`, { auth: true });
    return <JourneyView initial={r.journey} initialImpact={r.impact} />;
  } catch (e) {
    if (e instanceof ApiFailure && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}
