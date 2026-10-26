const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "chưa rõ thời điểm";
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "vừa xong";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function distance(m: number | null | undefined): string {
  if (m == null) return "";
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60 ? `${m % 60} phút` : ""}`.trim();
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}
