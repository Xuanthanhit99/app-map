import { evaluateEvidence, type VerifiedPlace } from "./decision-engine";

/** Read-only boundary: no synthetic observations and no implicit location access. */
export interface VerifiedEvidenceRepository {
  listPlaces(): Promise<readonly VerifiedPlace[]>;
}

export class UnconfiguredEvidenceRepository implements VerifiedEvidenceRepository {
  async listPlaces(): Promise<readonly VerifiedPlace[]> {
    return [];
  }
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
