import { z } from "zod";
import { badRequest, notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse } from "../http/validate";
import { geohash, haversineMeters } from "../lib/geo";
import { CATEGORY_BY_ID, PLACE_CATEGORIES } from "../../../../src/reality/categories";
import { DECISION_POLICY_VERSION, parseIntent, rankCandidates, type Candidate, type StateSummary } from "../../../../src/reality/decision";
import { hasConsent } from "./account";
import { PLACE_SELECT, placeOut } from "./places";
import { evaluatePlaces, statesInBBox, type PublicState } from "./reality/repository";
import type { AppDeps } from "./deps";

const DEFAULT_RADIUS = { WALKING: 1500, CYCLING: 4000, MOTORBIKE: 8000, DRIVING: 8000 } as const;

export const decideSchema = z.object({
  intent: z.string().trim().min(2).max(200),
  origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
  /** Explicit, per-request consent to use the supplied origin. Never inferred from IP or GPS. */
  useLocation: z.boolean().default(false),
  areaId: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  availableMinutes: z.number().int().min(10).max(720).optional(),
  mode: z.enum(["DRIVING", "WALKING", "CYCLING", "MOTORBIKE"]).optional(),
  radiusMeters: z.number().int().min(200).max(20_000).optional(),
  categories: z.array(z.string().regex(/^[a-z_]{2,32}$/)).max(5).optional(),
  wheelchair: z.boolean().optional(),
  limit: z.number().int().min(1).max(5).default(3),
}).strict();

const summary = (s: PublicState | undefined): StateSummary | undefined => s && ({ truth: s.truth, value: s.value, freshness: s.freshness, safety: s.safety, sourceIds: s.sourceIds, observedAt: s.observedAt, nature: s.nature });

export function createDecisionService(deps: AppDeps) {
  const { db } = deps;
  return async function decide(input: z.infer<typeof decideSchema>, userId: string | null) {
    if (input.origin && !input.useLocation) throw badRequest("LOCATION_CONSENT_REQUIRED");
    if (!input.origin && !input.areaId) throw badRequest("ORIGIN_OR_AREA_REQUIRED");
    const now = deps.now();

    let preferred: string[] = [];
    let mode = input.mode;
    let wheelchair = input.wheelchair ?? false;
    let personalized = false;
    if (userId && await hasConsent(db, userId, "context_personalization")) {
      const p = await db.query<{ travel_mode: string; preferred_categories: string[]; accessibility_needs: string[] }>("SELECT travel_mode, preferred_categories, accessibility_needs FROM user_preferences WHERE user_id = $1", [userId]);
      const row = p.rows[0];
      if (row) {
        personalized = true;
        preferred = row.preferred_categories;
        mode ??= row.travel_mode as "DRIVING" | "WALKING" | "CYCLING" | "MOTORBIKE";
        wheelchair ||= row.accessibility_needs.includes("WHEELCHAIR");
      }
    }
    mode ??= "MOTORBIKE";
    const intent = parseIntent(input.intent + (wheelchair ? " xe lan" : ""), input.categories ?? []);
    if (!intent.categories.length) {
      return { status: "needs_clarification" as const, intent, suggestions: PLACE_CATEGORIES.filter((c) => !["hospital", "pharmacy", "fuel", "parking", "hotel"].includes(c.id)).slice(0, 8).map((c) => ({ id: c.id, label: c.label })),
        message: "Chưa hiểu bạn muốn đi đâu. Hãy chọn một loại địa điểm.", policyVersion: DECISION_POLICY_VERSION, evaluatedAt: now.toISOString() };
    }
    const radius = input.radiusMeters ?? DEFAULT_RADIUS[mode];

    let rows;
    if (input.origin) {
      ({ rows } = await db.query(
        `${PLACE_SELECT}, ST_Distance(p.geom, o.pt) AS distance_m FROM places p JOIN data_sources s ON s.id = p.source_id,
           (SELECT ST_SetSRID(ST_MakePoint($1,$2),4326)::geography AS pt) o
          WHERE p.status = 'active' AND p.category = ANY($3) AND ST_DWithin(p.geom, o.pt, $4)
          ORDER BY p.geom <-> o.pt LIMIT 40`, [input.origin.longitude, input.origin.latitude, intent.categories, radius]));
    } else {
      const area = await db.query("SELECT 1 FROM areas WHERE id = $1 AND bbox IS NOT NULL", [input.areaId]);
      if (!area.rowCount) throw notFound("AREA_NOT_FOUND");
      ({ rows } = await db.query(
        `${PLACE_SELECT}, NULL::float8 AS distance_m FROM places p JOIN data_sources s ON s.id = p.source_id, areas a
          WHERE a.id = $1 AND p.status = 'active' AND p.category = ANY($2) AND ST_Intersects(p.geom, a.bbox)
          ORDER BY p.updated_at DESC, p.id LIMIT 40`, [input.areaId, intent.categories]));
    }
    const places = rows.map(placeOut);
    if (!places.length) {
      return { status: "empty" as const, reason: "NO_CANDIDATES_IN_RANGE", intent, options: [], excluded: [], coverage: coverageNotes(intent.categories), policyVersion: DECISION_POLICY_VERSION, evaluatedAt: now.toISOString() };
    }
    const states = await evaluatePlaces(db, places.map((p) => p.id), now, ["PLACE_OPEN", "CROWD", "QUEUE", "PARKING"]);
    const lats = places.map((p) => p.coordinate[1]), lngs = places.map((p) => p.coordinate[0]);
    const env = { west: Math.min(...lngs) - 0.005, south: Math.min(...lats) - 0.005, east: Math.max(...lngs) + 0.005, north: Math.max(...lats) + 0.005 };
    const pointStates = await statesInBBox(db, env, now, ["ROAD", "WEATHER"], 1000);
    const weatherByCell = new Map(pointStates.filter((s) => s.domain === "WEATHER").map((s) => [s.subjectKey.split(":")[1], s]));
    const hazards = pointStates.filter((s) => s.domain === "ROAD" && s.truth === "KNOWN" && s.safety !== "NONE");

    const candidates: Candidate[] = places.map((p) => {
      const st = states.get(p.id) ?? [];
      const by = (d: string) => summary(st.find((s) => s.domain === d));
      let nearest: Candidate["nearbyHazard"] = null;
      for (const hz of hazards) {
        const d = haversineMeters({ lat: p.coordinate[1], lng: p.coordinate[0] }, { lat: hz.coordinate![1], lng: hz.coordinate![0] });
        if (d <= 300 && (!nearest || d < nearest.distanceMeters)) nearest = { ...summary(hz)!, distanceMeters: Math.round(d) };
      }
      return {
        placeId: p.id, name: p.name, category: p.category, distanceMeters: p.distanceMeters ?? null, wheelchair: p.wheelchair,
        openingHoursPublished: Boolean(p.openingHours),
        states: Object.fromEntries((["PLACE_OPEN", "CROWD", "QUEUE", "PARKING"] as const).map((d) => [d, by(d)]).filter(([, v]) => v)),
        weather: summary(weatherByCell.get(geohash(p.coordinate[1], p.coordinate[0], 5))) ?? null,
        nearbyHazard: nearest,
      };
    });
    const ranked = rankCandidates(candidates, { intent, availableMinutes: input.availableMinutes ?? null, mode, radiusMeters: radius, preferredCategories: preferred });
    const byId = new Map(places.map((p) => [p.id, p]));
    const options = ranked.included.slice(0, input.limit).map((x, i) => ({ rank: i + 1, place: byId.get(x.c.placeId)!, score: x.s.score, factors: x.s.factors, risks: x.s.risks, unknowns: x.s.unknowns, estimate: x.s.estimate,
      states: (states.get(x.c.placeId) ?? []).filter((s) => s.truth !== "UNKNOWN" || s.signals.length) }));
    return {
      status: options.length ? "ready" as const : "empty" as const,
      ...(options.length ? {} : { reason: "ALL_CANDIDATES_EXCLUDED" }),
      intent, mode, radiusMeters: radius, personalized,
      options,
      alternatives: ranked.included.slice(input.limit, input.limit + 5).map((x) => ({ place: byId.get(x.c.placeId)!, score: x.s.score })),
      excluded: ranked.excluded.slice(0, 10).map((x) => ({ place: byId.get(x.c.placeId)!, reason: x.s.exclusionReason })),
      coverage: coverageNotes(intent.categories),
      policyVersion: DECISION_POLICY_VERSION,
      evaluatedAt: now.toISOString(),
    };
  };
}

function coverageNotes(categories: string[]): string[] {
  return [
    `Địa điểm: OpenStreetMap (${categories.map((c) => CATEGORY_BY_ID.get(c)?.label ?? c).join(", ")}).`,
    "Tình trạng mở cửa, mức đông, hàng chờ: chỉ từ báo cáo cộng đồng đã đối chứng hoặc kiểm duyệt; chưa có nguồn trực tiếp từ doanh nghiệp.",
    "Thời tiết: dự báo mô hình (Open-Meteo), không phải đo đạc tại chỗ.",
    "Thời gian di chuyển: ước tính theo đường chim bay, không phải thời gian dẫn đường.",
  ];
}

export function registerDecisionRoutes(router: Router, deps: AppDeps) {
  const decide = createDecisionService(deps);
  router.post("/v1/decide", async (ctx) => ({ body: await decide(parse(decideSchema, ctx.body), ctx.user?.id ?? null) }),
    { auth: "optional", rateLimit: { name: "decide", limit: 30, windowMs: 60_000 } });
}
