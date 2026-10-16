import { evaluateEvidence, type EvidenceRecord, type VerifiedPlace } from "./decision-engine";

/** No synthetic observations: all records must be supplied by a configured, authenticated feed. */
export interface VerifiedEvidenceRepository {
  listPlaces(): Promise<readonly VerifiedPlace[]>;
}

export class UnconfiguredEvidenceRepository implements VerifiedEvidenceRepository {
  async listPlaces(): Promise<readonly VerifiedPlace[]> {
    return [];
  }
}

type FetchLike = typeof fetch;
export class EvidenceFeedError extends Error {
  constructor(message = "EVIDENCE_REPOSITORY_UNAVAILABLE") { super(message); this.name = "EvidenceFeedError"; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseEvidencePlaces(payload: unknown): VerifiedPlace[] {
  if (!isRecord(payload) || !Array.isArray(payload.places) || payload.places.length > 1000) throw new EvidenceFeedError("INVALID_EVIDENCE_FEED");
  const places: VerifiedPlace[] = [];
  const ids = new Set<string>();
  for (const raw of payload.places) {
    if (!isRecord(raw) || !isRecord(raw.evidence)) throw new EvidenceFeedError("INVALID_EVIDENCE_RECORD");
    const e = raw.evidence;
    const id = raw.id, title = raw.title, latitude = raw.latitude, longitude = raw.longitude;
    if (typeof id !== "string" || !id.trim() || id.length > 128 || ids.has(id) ||
        typeof title !== "string" || !title.trim() || title.length > 240 ||
        typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !["KNOWN", "UNKNOWN", "CONFLICT"].includes(String(e.truth)) ||
        (e.source !== null && (typeof e.source !== "string" || e.source.length > 256)) ||
        (e.provenanceId !== null && (typeof e.provenanceId !== "string" || e.provenanceId.length > 256)) ||
        (e.observedAt !== null && typeof e.observedAt !== "string")) {
      throw new EvidenceFeedError("INVALID_EVIDENCE_RECORD");
    }
    ids.add(id);
    places.push({ id, title, latitude, longitude, evidence: {
      truth: e.truth as EvidenceRecord["truth"],
      source: e.source as string | null,
      provenanceId: e.provenanceId as string | null,
      observedAt: e.observedAt as string | null,
    } });
  }
  return places;
}

/** HTTPS allowlisted upstream, bearer token kept on server, fail closed on errors. */
export class HttpVerifiedEvidenceRepository implements VerifiedEvidenceRepository {
  constructor(private readonly url: URL, private readonly token: string, private readonly transport: FetchLike = fetch) {
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.search || url.hash || !token.trim()) {
      throw new EvidenceFeedError("INVALID_EVIDENCE_CONFIGURATION");
    }
  }
  async listPlaces(): Promise<readonly VerifiedPlace[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.transport(this.url, {
        method: "GET", headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: controller.signal, redirect: "error",
      });
      if (!response.ok) throw new EvidenceFeedError();
      const length = response.headers.get("content-length");
      if (length && Number(length) > 262144) throw new EvidenceFeedError("EVIDENCE_FEED_TOO_LARGE");
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > 262144) throw new EvidenceFeedError("EVIDENCE_FEED_TOO_LARGE");
      return parseEvidencePlaces(JSON.parse(raw) as unknown);
    } catch (error) {
      if (error instanceof EvidenceFeedError) throw error;
      throw new EvidenceFeedError();
    } finally { clearTimeout(timeout); }
  }
}

export function evidenceRepositoryFromEnv(env: NodeJS.ProcessEnv = process.env): VerifiedEvidenceRepository {
  if (!env.EVIDENCE_FEED_URL && !env.EVIDENCE_FEED_TOKEN) return new UnconfiguredEvidenceRepository();
  if (!env.EVIDENCE_FEED_URL || !env.EVIDENCE_FEED_TOKEN) throw new EvidenceFeedError("INCOMPLETE_EVIDENCE_CONFIGURATION");
  return new HttpVerifiedEvidenceRepository(new URL(env.EVIDENCE_FEED_URL), env.EVIDENCE_FEED_TOKEN);
}

export async function readVerifiedPlaces(repository: VerifiedEvidenceRepository, now = Date.now()): Promise<readonly VerifiedPlace[]> {
  const places = await repository.listPlaces();
  return places.filter((place) =>
    typeof place.id === "string" && place.id.trim().length > 0 &&
    typeof place.title === "string" && place.title.trim().length > 0 &&
    Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
    Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180 &&
    evaluateEvidence(place.evidence, now).safeToAssert
  );
}
