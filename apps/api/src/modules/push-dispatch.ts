import type { Queryable } from "../db/pool";
import type { PushSender } from "../lib/push";

/**
 * Sends pending in-app notifications as push messages.
 *
 * - Only notifications created in the last hour are pushed (a stale alert is worse than none).
 * - Only users whose latest `notifications` consent is granted, to their active tokens.
 * - SAFETY_CRITICAL uses high priority; everything else default.
 * - Quiet hours (user preference, Vietnam local time) suppress every push except SAFETY_CRITICAL;
 *   the notification stays in the in-app inbox.
 * - A notification is marked pushed once attempted; permanent token failures disable the token.
 */
export async function dispatchPendingPushes(db: Queryable, push: PushSender, now: Date, limit = 200): Promise<{ notifications: number; sent: number; failed: number; disabledTokens: number }> {
  if (!push.available) return { notifications: 0, sent: 0, failed: 0, disabledTokens: 0 };
  const { rows } = await db.query<{ id: string; title: string; body: string; severity: string; data: Record<string, unknown>; tokens: string[]; quiet: boolean }>(
    `SELECT n.id, n.title, n.body, n.severity, n.data,
            COALESCE(array_agg(t.token) FILTER (WHERE t.token IS NOT NULL), '{}') AS tokens,
            COALESCE(bool_or(p.quiet_hours @> extract(hour FROM ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int), false) AS quiet
       FROM notifications n
       JOIN LATERAL (SELECT granted FROM consents c WHERE c.user_id = n.user_id AND c.purpose = 'notifications' ORDER BY c.created_at DESC LIMIT 1) c ON c.granted
       LEFT JOIN user_preferences p ON p.user_id = n.user_id
       LEFT JOIN push_tokens t ON t.user_id = n.user_id AND t.disabled_at IS NULL
      WHERE n.pushed_at IS NULL AND n.created_at > $1::timestamptz - interval '1 hour' AND n.read_at IS NULL
      GROUP BY n.id ORDER BY n.created_at LIMIT $2`, [now, limit]);
  let sent = 0, failed = 0, disabledTokens = 0;
  for (const n of rows) {
    if (n.quiet && n.severity !== "SAFETY_CRITICAL") {
      await db.query("UPDATE notifications SET pushed_at = $2, push_error = 'QUIET_HOURS' WHERE id = $1", [n.id, now]);
      continue;
    }
    const results = n.tokens.length
      ? await push.send(n.tokens.map((to) => ({ to, title: n.title, body: n.body, data: { notificationId: n.id, ...pick(n.data) }, priority: n.severity === "SAFETY_CRITICAL" ? "high" as const : "default" as const })))
      : [];
    for (const r of results) {
      if (r.ok) sent++;
      else {
        failed++;
        if (r.permanent) { await db.query("UPDATE push_tokens SET disabled_at = $2, disabled_reason = $3 WHERE token = $1 AND disabled_at IS NULL", [r.to, now, r.error.slice(0, 60)]); disabledTokens++; }
      }
    }
    const errors = results.filter((r) => !r.ok).map((r) => (r as { error: string }).error);
    await db.query("UPDATE notifications SET pushed_at = $2, push_error = $3 WHERE id = $1", [n.id, now, n.tokens.length === 0 ? "NO_ACTIVE_TOKEN" : errors.length ? [...new Set(errors)].join(",").slice(0, 200) : null]);
  }
  return { notifications: rows.length, sent, failed, disabledTokens };
}

/** Only routing hints travel in the push payload; never coordinates. */
function pick(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["placeId", "placeSlug", "journeyId", "watchAreaId", "domain"]) if (typeof data[k] === "string") out[k] = data[k];
  return out;
}
