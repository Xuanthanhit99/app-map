import type { Queryable } from "../../db/pool";
import { DOMAIN_CATALOG, REALITY_DOMAINS, SEVERITY_RANK, severityOf, type ImpactSeverity, type RealityDomain } from "../../../../../src/reality/catalog";
import { evaluateState, type Evidence, type StateEvaluation } from "../../../../../src/reality/state-engine";
import { geohashCenter, type BBox } from "../../lib/geo";

/** Geohash precision used as the subject cell for point-based domains. */
export const CELL_PRECISION: Partial<Record<RealityDomain, number>> = { ROAD: 7, WEATHER: 5, ACTIVITY: 6, VEHICLE: 7 };
export const PLACE_DOMAINS: RealityDomain[] = ["PLACE_OPEN", "CROWD", "QUEUE", "PARKING", "PRICE"];

type EvidenceRow = {
  id: string; value: string; domain: RealityDomain; source_id: string; kind: Evidence["sourceKind"]; reliability: number;
  nature: Evidence["nature"]; observed_at: Date; valid_until: Date; confidence: number; contributor: string | null;
  place_id: string | null; cell: string | null; attribution: string; license: string; source_name: string;
};

const EVIDENCE_SELECT = `
  SELECT o.id, o.value, o.domain, o.source_id, s.kind, s.reliability, o.nature, o.observed_at, o.valid_until, o.confidence,
         CASE WHEN o.report_id IS NOT NULL THEN COALESCE(r.reporter_id::text, 'anon:' || r.id::text)
              WHEN o.dedupe_key LIKE 'vote:%' THEN split_part(o.dedupe_key, ':', 3) ELSE NULL END AS contributor,
         o.place_id, s.attribution, s.license, s.name AS source_name,
         CASE o.domain WHEN 'ROAD' THEN ST_GeoHash(o.geom::geometry, 7) WHEN 'WEATHER' THEN ST_GeoHash(o.geom::geometry, 5)
                       WHEN 'ACTIVITY' THEN ST_GeoHash(o.geom::geometry, 6) ELSE ST_GeoHash(o.geom::geometry, 7) END AS cell
    FROM observations o
    JOIN data_sources s ON s.id = o.source_id
    LEFT JOIN reports r ON r.id = o.report_id
   WHERE o.valid_until > $1
     AND (o.report_id IS NULL OR (r.held_for_review = false AND r.status NOT IN ('REJECTED','HIDDEN','EXPIRED','DUPLICATE')))`;

function toEvidence(r: EvidenceRow): Evidence {
  return { id: r.id, value: r.value, sourceId: r.source_id, sourceKind: r.kind, sourceReliability: r.reliability, nature: r.nature,
    observedAt: r.observed_at.getTime(), validUntil: r.valid_until.getTime(), confidence: r.confidence, contributor: r.contributor };
}

export type SourceRef = { id: string; name: string; attribution: string; license: string };
export type PublicState = Omit<StateEvaluation, "observedAt" | "validUntil" | "signals"> & {
  subjectKey: string;
  observedAt: string | null;
  validUntil: string | null;
  sources: SourceRef[];
  signals: { type: "REPORTED_UNVERIFIED"; value: string; contributors: number; latestAt: string }[];
  severity: ImpactSeverity;
  label: string | null;
  coordinate?: [number, number];
};

function publicState(subjectKey: string, ev: StateEvaluation, rows: EvidenceRow[], coordinate?: [number, number]): PublicState {
  const sources = new Map<string, SourceRef>();
  for (const r of rows) if (ev.sourceIds.includes(r.source_id)) sources.set(r.source_id, { id: r.source_id, name: r.source_name, attribution: r.attribution, license: r.license });
  const { observedAt, validUntil, signals, ...rest } = ev;
  return {
    ...rest,
    subjectKey,
    observedAt: observedAt === null ? null : new Date(observedAt).toISOString(),
    validUntil: validUntil === null ? null : new Date(validUntil).toISOString(),
    signals: signals.map((s) => ({ ...s, latestAt: new Date(s.latestAt).toISOString() })),
    sources: [...sources.values()],
    severity: severityOf({ truth: ev.truth, safety: ev.safety, domain: ev.domain, value: ev.value }),
    label: ev.value ? DOMAIN_CATALOG[ev.domain].values[ev.value]?.label ?? null : null,
    ...(coordinate ? { coordinate } : {}),
  };
}

export async function evaluatePlace(q: Queryable, placeId: string, now: Date, domains: RealityDomain[] = PLACE_DOMAINS): Promise<PublicState[]> {
  const { rows } = await q.query<EvidenceRow>(`${EVIDENCE_SELECT} AND o.place_id = $2 AND o.domain = ANY($3)`, [now, placeId, domains]);
  return domains.map((domain) => {
    const own = rows.filter((r) => r.domain === domain);
    return publicState(`place:${placeId}:${domain}`, evaluateState(domain, own.map(toEvidence), now.getTime()), own);
  });
}

/** Point-domain states (road, weather, activity) grouped by subject cell inside a bbox. */
export async function statesInBBox(q: Queryable, bbox: BBox, now: Date, domains: RealityDomain[] = ["ROAD", "WEATHER", "ACTIVITY"], limit = 300): Promise<PublicState[]> {
  const { rows } = await q.query<EvidenceRow>(
    `${EVIDENCE_SELECT} AND o.place_id IS NULL AND o.domain = ANY($2)
       AND o.geom && ST_MakeEnvelope($3, $4, $5, $6, 4326)::geography
     ORDER BY o.observed_at DESC LIMIT 5000`,
    [now, domains, bbox.west, bbox.south, bbox.east, bbox.north]);
  const groups = new Map<string, EvidenceRow[]>();
  for (const r of rows) {
    const key = `cell:${r.cell}:${r.domain}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out: PublicState[] = [];
  for (const [key, list] of groups) {
    const domain = list[0]!.domain;
    const centre = geohashCenter(list[0]!.cell!);
    out.push(publicState(key, evaluateState(domain, list.map(toEvidence), now.getTime()), list, [centre.lng, centre.lat]));
  }
  // Highest consequence first, then uncertainty, then freshest.
  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.observedAt ?? "").localeCompare(a.observedAt ?? "")).slice(0, limit);
}

export async function evaluateSubject(q: Queryable, subjectKey: string, now: Date): Promise<{ state: PublicState; lat: number; lng: number } | null> {
  const [kind, id, domain] = subjectKey.split(":") as [string, string, RealityDomain];
  if (!REALITY_DOMAINS.includes(domain)) return null;
  if (kind === "place") {
    const loc = await q.query<{ lat: number; lng: number }>("SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM places WHERE id = $1", [id]);
    if (!loc.rows[0]) return null;
    const [state] = await evaluatePlace(q, id, now, [domain]);
    return { state: state!, lat: loc.rows[0].lat, lng: loc.rows[0].lng };
  }
  if (kind === "cell") {
    const precision = CELL_PRECISION[domain] ?? 7;
    const { rows } = await q.query<EvidenceRow>(`${EVIDENCE_SELECT} AND o.place_id IS NULL AND o.domain = $2 AND ST_GeoHash(o.geom::geometry, $4) = $3`, [now, domain, id, precision]);
    const c = geohashCenter(id);
    return { state: publicState(subjectKey, evaluateState(domain, rows.map(toEvidence), now.getTime()), rows, [c.lng, c.lat]), lat: c.lat, lng: c.lng };
  }
  return null;
}

export type StateChange = { subjectKey: string; domain: RealityDomain; lat: number; lng: number; before: { truth: string; value: string | null; safety: string } | null; after: PublicState };

/**
 * Persist a snapshot when the meaningful part of a state (truth, value, safety) changed.
 * Returns the change for fan-out to Watch Areas, World Pulse and Journey Impact.
 */
export async function recordStateIfChanged(q: Queryable, subjectKey: string, now: Date): Promise<StateChange | null> {
  const evaluated = await evaluateSubject(q, subjectKey, now);
  if (!evaluated) return null;
  const { state, lat, lng } = evaluated;
  const prev = await q.query<{ truth: string; value: string | null; safety: string }>(
    "SELECT truth, value, safety FROM reality_state_snapshots WHERE subject_key = $1 ORDER BY evaluated_at DESC, id DESC LIMIT 1", [subjectKey]);
  const before = prev.rows[0] ?? null;
  if (before && before.truth === state.truth && before.value === state.value && before.safety === state.safety) return null;
  if (!before && state.truth === "UNKNOWN" && !state.signals.length) return null;
  await q.query(
    `INSERT INTO reality_state_snapshots (subject_key, domain, geom, truth, value, freshness, safety, confidence, evidence_ids, evaluated_at)
     VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5,$6,$7,$8,$9,$10,$11)`,
    [subjectKey, state.domain, lng, lat, state.truth, state.value, state.freshness, state.safety, state.confidence, state.supportingEvidenceIds, now]);
  return { subjectKey, domain: state.domain, lat, lng, before, after: state };
}

const COOLDOWN_MS = 30 * 60_000;

/** Fan a state change out to watch areas and active journeys. Only meaningful, de-duplicated notifications. */
export async function fanOutChange(q: Queryable, change: StateChange, now: Date): Promise<number> {
  const severity = change.after.severity;
  const cleared = change.before && change.before.safety !== "NONE" && change.after.safety === "NONE";
  const label = change.after.label ?? DOMAIN_CATALOG[change.domain].label;
  const title = cleared ? `${DOMAIN_CATALOG[change.domain].label}: tình trạng nguy hiểm không còn được xác nhận`
    : change.after.truth === "KNOWN" ? `${label}` : change.after.truth === "CONFLICT" ? `${DOMAIN_CATALOG[change.domain].label}: thông tin đang mâu thuẫn`
    : `${DOMAIN_CATALOG[change.domain].label}: có báo cáo chưa xác minh`;
  const body = change.after.truth === "KNOWN"
    ? `Đã xác nhận bởi ${change.after.sources.map((s) => s.name).join(", ") || "nguồn"} · ${change.after.freshness === "FRESH" ? "mới cập nhật" : "đang cũ dần"}.`
    : change.after.truth === "CONFLICT" ? "Các nguồn gần đây cho tín hiệu khác nhau. Hãy kiểm tra trước khi đi."
    : "Chưa đủ xác minh. Không có dữ liệu xác minh không có nghĩa là an toàn.";
  const effectiveSeverity: ImpactSeverity = cleared ? "INFO" : severity;
  let created = 0;

  const watches = await q.query<{ id: string; user_id: string; min_severity: ImpactSeverity }>(
    `SELECT id, user_id, min_severity FROM watch_areas
      WHERE active AND $1 = ANY(domains)
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, radius_m)`,
    [change.domain, change.lng, change.lat]);
  for (const w of watches.rows) {
    if (SEVERITY_RANK[effectiveSeverity] < SEVERITY_RANK[w.min_severity] && !(cleared && SEVERITY_RANK[w.min_severity] <= SEVERITY_RANK.SIGNIFICANT)) continue;
    const recent = await q.query("SELECT 1 FROM notifications WHERE watch_area_id = $1 AND data->>'subjectKey' = $2 AND created_at > $3 LIMIT 1",
      [w.id, change.subjectKey, new Date(now.getTime() - COOLDOWN_MS)]);
    if (recent.rowCount && effectiveSeverity !== "SAFETY_CRITICAL") continue;
    const r = await q.query(
      `INSERT INTO notifications (user_id, kind, severity, title, body, data, dedupe_key, watch_area_id)
       VALUES ($1,'WATCH_CHANGE',$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
      [w.user_id, effectiveSeverity, title, body, JSON.stringify({ subjectKey: change.subjectKey, domain: change.domain, truth: change.after.truth, value: change.after.value }),
        `watch:${w.id}:${change.subjectKey}:${change.after.truth}:${change.after.value ?? "-"}`, w.id]);
    created += r.rowCount ?? 0;
  }

  if (SEVERITY_RANK[effectiveSeverity] >= SEVERITY_RANK.MINOR || cleared) {
    const journeys = await q.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM journeys WHERE status IN ('ACTIVE','PAUSED','PLANNED') AND route_geom IS NOT NULL
         AND ST_DWithin(route_geom, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 300)`, [change.lng, change.lat]);
    for (const j of journeys.rows) {
      const r = await q.query(
        `INSERT INTO notifications (user_id, kind, severity, title, body, data, dedupe_key, journey_id)
         VALUES ($1,'JOURNEY_IMPACT',$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [j.user_id, effectiveSeverity, `Trên tuyến của bạn · ${title}`, body,
          JSON.stringify({ subjectKey: change.subjectKey, journeyId: j.id, domain: change.domain, truth: change.after.truth, value: change.after.value }),
          `journey:${j.id}:${change.subjectKey}:${change.after.truth}:${change.after.value ?? "-"}`, j.id]);
      if (r.rowCount) {
        created++;
        await q.query("INSERT INTO journey_events (journey_id, type, detail) VALUES ($1,'IMPACT',$2)",
          [j.id, JSON.stringify({ subjectKey: change.subjectKey, severity: effectiveSeverity, truth: change.after.truth, value: change.after.value })]);
      }
    }
  }
  return created;
}

export async function propagate(q: Queryable, subjectKeys: string[], now: Date): Promise<StateChange[]> {
  const changes: StateChange[] = [];
  for (const key of new Set(subjectKeys)) {
    const change = await recordStateIfChanged(q, key, now);
    if (change) { changes.push(change); await fanOutChange(q, change, now); }
  }
  return changes;
}
