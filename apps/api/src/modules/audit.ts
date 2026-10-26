import type { Queryable } from "../db/pool";
import type { AuthUser } from "../http/router";

const FORBIDDEN_KEYS = /token|password|secret|lat|lng|lon|coord|geom|email/i;

/** Append-only audit log. Detail is scrubbed of coordinates, credentials and email addresses. */
export async function audit(q: Queryable, entry: {
  actor: Pick<AuthUser, "id" | "role"> | null; action: string; targetType?: string; targetId?: string;
  detail?: Record<string, unknown>; requestId?: string;
}): Promise<void> {
  const detail = Object.fromEntries(Object.entries(entry.detail ?? {}).filter(([k]) => !FORBIDDEN_KEYS.test(k)));
  await q.query(
    `INSERT INTO audit_events (actor_id, actor_role, action, target_type, target_id, detail, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [entry.actor?.id ?? null, entry.actor?.role ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null,
      JSON.stringify(detail), entry.requestId ?? null],
  );
}
