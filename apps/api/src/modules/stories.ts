import { randomBytes } from "node:crypto";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "../http/errors";
import type { Router } from "../http/router";
import { parse, queryObject } from "../http/validate";
import { slugify } from "../lib/slug";
import { audit } from "./audit";
import type { AppDeps } from "./deps";

/**
 * Place-based Stories. Authored by signed-in users, published only after moderator review, and only with
 * at least one attributable source. Published stories are public and indexable; drafts never are.
 */
const sourceSchema = z.object({ title: z.string().trim().min(2).max(200), url: z.string().url().max(500).refine((u) => /^https?:\/\//.test(u)) });
export const storySchema = z.object({
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(10).max(300),
  body: z.string().trim().min(40).max(20_000),
  placeId: z.string().uuid().optional(),
  sources: z.array(sourceSchema).max(10).default([]),
}).strict();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function storyOut(r: any, full = false) {
  return {
    id: r.id, slug: r.slug, title: r.title, summary: r.summary, status: r.status,
    place: r.place_id ? { id: r.place_id, slug: r.place_slug, name: r.place_name } : null,
    author: r.author_name ? { displayName: r.author_name } : null,
    publishedAt: r.published_at?.toISOString() ?? null, updatedAt: r.updated_at.toISOString(),
    ...(full ? { body: r.body, sources: r.sources } : {}),
  };
}

const SELECT = `SELECT s.*, p.slug AS place_slug, p.name AS place_name, u.display_name AS author_name
  FROM stories s LEFT JOIN places p ON p.id = s.place_id LEFT JOIN users u ON u.id = s.author_id`;

export function registerStoryRoutes(router: Router, deps: AppDeps) {
  const { db } = deps;

  router.get("/v1/stories", async (ctx) => {
    const q = parse(z.object({ placeId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().regex(/^\d{1,4}$/).optional() }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(`${SELECT} WHERE s.status = 'PUBLISHED' AND ($1::uuid IS NULL OR s.place_id = $1) ORDER BY s.published_at DESC LIMIT $2 OFFSET $3`,
      [q.placeId ?? null, q.limit + 1, Number(q.cursor ?? 0)]);
    return { body: { items: rows.slice(0, q.limit).map((r) => storyOut(r)), nextCursor: rows.length > q.limit ? String(Number(q.cursor ?? 0) + q.limit) : null } };
  }, { cacheSeconds: 60 });

  router.get("/v1/stories/:slug", async (ctx) => {
    const { rows } = await db.query(`${SELECT} WHERE s.slug = $1`, [ctx.params.slug]);
    const r = rows[0];
    // Unpublished stories are visible only to their author and moderators.
    if (!r || (r.status !== "PUBLISHED" && !(ctx.user && (ctx.user.id === r.author_id || ctx.user.role !== "user")))) throw notFound("STORY_NOT_FOUND");
    return { body: { story: storyOut(r, true) } };
  }, { auth: "optional" });

  router.get("/v1/me/stories", async (ctx) => {
    const { rows } = await db.query(`${SELECT} WHERE s.author_id = $1 ORDER BY s.updated_at DESC LIMIT 100`, [ctx.user!.id]);
    return { body: { items: rows.map((r) => storyOut(r)) } };
  }, { auth: "user" });

  router.post("/v1/stories", async (ctx) => {
    const input = parse(storySchema, ctx.body);
    if (input.placeId && !(await db.query("SELECT 1 FROM places WHERE id = $1 AND status = 'active'", [input.placeId])).rowCount) throw notFound("PLACE_NOT_FOUND");
    const slug = `${slugify(input.title, 70)}-${randomBytes(3).toString("hex")}`;
    const { rows } = await db.query(
      `INSERT INTO stories (slug, place_id, author_id, title, summary, body, sources, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT') RETURNING id`,
      [slug, input.placeId ?? null, ctx.user!.id, input.title, input.summary, input.body, JSON.stringify(input.sources)]);
    await audit(db, { actor: ctx.user, action: "story.created", targetType: "STORY", targetId: rows[0].id, requestId: ctx.requestId });
    return { status: 201, body: { id: rows[0].id, slug } };
  }, { auth: "user", bodyLimit: 64 * 1024, rateLimit: { name: "story-create", limit: 10, windowMs: 86_400_000 } });

  router.put("/v1/stories/:id", async (ctx) => {
    const id = parse(z.string().uuid(), ctx.params.id);
    const input = parse(storySchema, ctx.body);
    const r = await db.query(
      `UPDATE stories SET title = $3, summary = $4, body = $5, sources = $6, place_id = $7, status = 'DRAFT', updated_at = now()
        WHERE id = $1 AND author_id = $2 AND status IN ('DRAFT','REJECTED','PENDING_REVIEW')`,
      [id, ctx.user!.id, input.title, input.summary, input.body, JSON.stringify(input.sources), input.placeId ?? null]);
    if (!r.rowCount) throw notFound("STORY_NOT_FOUND");
    return { status: 204 };
  }, { auth: "user", bodyLimit: 64 * 1024 });

  router.post("/v1/stories/:id/submit", async (ctx) => {
    const id = parse(z.string().uuid(), ctx.params.id);
    const { rows } = await db.query("SELECT sources, status, author_id FROM stories WHERE id = $1", [id]);
    const s = rows[0];
    if (!s || s.author_id !== ctx.user!.id) throw notFound("STORY_NOT_FOUND");
    if (!Array.isArray(s.sources) || s.sources.length === 0) throw badRequest("SOURCE_ATTRIBUTION_REQUIRED");
    if (!["DRAFT", "REJECTED"].includes(s.status)) throw badRequest("INVALID_STORY_STATE");
    await db.query("UPDATE stories SET status = 'PENDING_REVIEW', updated_at = now() WHERE id = $1", [id]);
    await audit(db, { actor: ctx.user, action: "story.submitted", targetType: "STORY", targetId: id, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "user" });

  router.get("/v1/admin/stories", async (ctx) => {
    const q = parse(z.object({ status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"]).default("PENDING_REVIEW") }).strict(), queryObject(ctx.query));
    const { rows } = await db.query(`${SELECT} WHERE s.status = $1 ORDER BY s.updated_at ASC LIMIT 100`, [q.status]);
    return { body: { items: rows.map((r) => storyOut(r, true)) } };
  }, { auth: "moderator" });

  router.post("/v1/admin/stories/:id/moderate", async (ctx) => {
    const id = parse(z.string().uuid(), ctx.params.id);
    const input = parse(z.object({ action: z.enum(["PUBLISH", "REJECT", "ARCHIVE"]), reason: z.string().trim().min(3).max(500) }).strict(), ctx.body);
    const { rows } = await db.query("SELECT status, author_id, sources FROM stories WHERE id = $1", [id]);
    const s = rows[0];
    if (!s) throw notFound("STORY_NOT_FOUND");
    if (s.author_id === ctx.user!.id) throw forbidden("CANNOT_MODERATE_OWN_STORY");
    if (input.action === "PUBLISH" && (s.status !== "PENDING_REVIEW" || !s.sources.length)) throw badRequest("INVALID_STORY_STATE");
    const status = input.action === "PUBLISH" ? "PUBLISHED" : input.action === "REJECT" ? "REJECTED" : "ARCHIVED";
    await db.query("UPDATE stories SET status = $2, published_at = CASE WHEN $2 = 'PUBLISHED' THEN now() ELSE published_at END, updated_at = now() WHERE id = $1", [id, status]);
    await db.query("INSERT INTO moderation_actions (target_type, target_id, moderator_id, action, reason) VALUES ('STORY',$1,$2,$3,$4)", [id, ctx.user!.id, input.action, input.reason]);
    await audit(db, { actor: ctx.user, action: `moderation.story_${input.action.toLowerCase()}`, targetType: "STORY", targetId: id, requestId: ctx.requestId });
    return { status: 204 };
  }, { auth: "moderator" });
}
