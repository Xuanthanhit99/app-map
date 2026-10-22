import type { Db } from "../db/pool";

/**
 * Documented retention policy (docs/product/REALITY_FULL_PRODUCT_MASTER.md §Privacy):
 *  - sessions: deleted 30 days after the refresh token expired or was revoked;
 *  - reports: precise point coarsened to the public ~150 m cell and note removed 90 days after expiry;
 *  - observations: deleted 30 days after they stopped contributing (validUntil);
 *  - state snapshots: older than 30 days deleted, except the latest per subject;
 *  - journeys: route geometry dropped 180 days after the journey ended;
 *  - notifications: read notifications deleted after 90 days, all after 365 days;
 *  - audit events: deleted after 365 days.
 */
export const RETENTION_DAYS = { sessions: 30, reportsPrecise: 90, observations: 30, snapshots: 30, journeyRoutes: 180, readNotifications: 90, notifications: 365, audit: 365 } as const;

export async function applyRetention(db: Db, now: Date) {
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const run = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
  return {
    sessions: await run("DELETE FROM sessions WHERE refresh_expires_at < $1 OR revoked_at < $1", [d(RETENTION_DAYS.sessions)]),
    reportsCoarsened: await run(`UPDATE reports SET geom = ST_SetSRID(ST_PointFromGeoHash(public_cell), 4326)::geography, note = NULL
                                  WHERE expires_at < $1 AND (note IS NOT NULL OR NOT ST_Equals(geom::geometry, ST_SetSRID(ST_PointFromGeoHash(public_cell), 4326)))`, [d(RETENTION_DAYS.reportsPrecise)]),
    observations: await run("DELETE FROM observations WHERE valid_until < $1", [d(RETENTION_DAYS.observations)]),
    snapshots: await run(`DELETE FROM reality_state_snapshots s WHERE evaluated_at < $1
                           AND id <> (SELECT max(id) FROM reality_state_snapshots x WHERE x.subject_key = s.subject_key)`, [d(RETENTION_DAYS.snapshots)]),
    journeyRoutes: await run("UPDATE journeys SET route_geom = NULL WHERE ended_at < $1 AND route_geom IS NOT NULL", [d(RETENTION_DAYS.journeyRoutes)]),
    notifications: await run("DELETE FROM notifications WHERE (read_at IS NOT NULL AND read_at < $1) OR created_at < $2", [d(RETENTION_DAYS.readNotifications), d(RETENTION_DAYS.notifications)]),
    audit: await run("DELETE FROM audit_events WHERE created_at < $1", [d(RETENTION_DAYS.audit)]),
  };
}
