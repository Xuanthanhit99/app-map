/**
 * Formats a provider ETA in Vietnamese. Rounds to whole minutes first so the
 * minute part can never read "60 phút" (e.g. 7170s -> "2 giờ", not "1 giờ 60 phút").
 * Returns null for invalid input so callers never render a fabricated duration.
 */
export function formatDurationVi(durationSeconds: number): string | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phút`;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`;
}
