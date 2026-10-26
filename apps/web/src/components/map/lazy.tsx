"use client";
import dynamic from "next/dynamic";

const loading = () => <div className="skeleton" style={{ position: "absolute", inset: 0 }} aria-label="Đang tải bản đồ" />;
export const LazyMapExplorer = dynamic(() => import("./map-explorer").then((m) => m.MapExplorer), { ssr: false, loading });
export const LazyMiniMap = dynamic(() => import("./mini-map").then((m) => m.MiniMap), { ssr: false, loading });
export const LazyJourneyMap = dynamic(() => import("./journey-map").then((m) => m.JourneyMap), { ssr: false, loading });
