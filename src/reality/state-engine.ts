import type { Freshness, SafetyLevel, TruthStatus } from "../domain/state-model";
import { DOMAIN_CATALOG, freshnessFor, type RealityDomain } from "./catalog";

/**
 * Reality State Engine (pure). Derives a state from the *active* evidence for one subject + domain.
 *
 * Trust policy (explicit, versioned):
 *  P1  Only evidence with validUntil > now contributes.
 *  P2  An authoritative observation (non-community source, reliability >= 0.5) can establish KNOWN alone.
 *  P3  Community evidence establishes KNOWN only when >= 2 distinct contributors agree on the same value
 *      and no credible contradiction exists. A single report is surfaced as REPORTED_UNVERIFIED (truth UNKNOWN).
 *  P4  Two credible candidates with different values => CONFLICT (Conflict != Danger: safety stays NONE).
 *  P5  Safety is derived only from a KNOWN value. UNKNOWN is never SAFE: callers must not render it as clear.
 *  P6  Freshness is computed from the newest supporting observation and is independent from truth.
 *  P7  FORECAST / MODEL_ESTIMATE nature is carried through so clients label it as such.
 */
export const TRUST_POLICY_VERSION = "2026-10-22.1";

export type EvidenceNature = "LIVE_OBSERVATION" | "FORECAST" | "MODEL_ESTIMATE" | "STATIC_REFERENCE" | "COMMUNITY_REPORT";
export type SourceKind = "OFFICIAL_PROVIDER" | "OPEN_DATA" | "COMMERCIAL_API" | "SENSOR" | "COMMUNITY" | "ROUTING_ENGINE" | "MODEL";

export type Evidence = {
  id: string;
  value: string;
  sourceId: string;
  sourceKind: SourceKind;
  sourceReliability: number;
  nature: EvidenceNature;
  observedAt: number;
  validUntil: number;
  confidence: number;
  /** Distinct contributor for community evidence (opaque id); null for providers. */
  contributor: string | null;
};

export type StateSignal = { type: "REPORTED_UNVERIFIED"; value: string; contributors: number; latestAt: number };

export type StateEvaluation = {
  domain: RealityDomain;
  truth: TruthStatus;
  value: string | null;
  freshness: Freshness | null;
  safety: SafetyLevel;
  confidence: number;
  nature: EvidenceNature | null;
  observedAt: number | null;
  validUntil: number | null;
  supportingEvidenceIds: string[];
  sourceIds: string[];
  candidates: { value: string; weight: number; contributors: number; authoritative: boolean }[];
  signals: StateSignal[];
  policyVersion: string;
  reason: "NO_ACTIVE_EVIDENCE" | "SINGLE_UNVERIFIED_REPORT" | "INSUFFICIENT_CORROBORATION" | "CREDIBLE_DISAGREEMENT" | "ESTABLISHED";
};

const AUTHORITATIVE_MIN_RELIABILITY = 0.5;
const COMMUNITY_MIN_CONTRIBUTORS = 2;
/** A candidate must reach this share of the leader's weight to count as a credible contradiction. */
const CONFLICT_RATIO = 0.6;

function isAuthoritative(e: Evidence): boolean {
  return e.sourceKind !== "COMMUNITY" && e.nature !== "COMMUNITY_REPORT" && e.sourceReliability >= AUTHORITATIVE_MIN_RELIABILITY;
}

export function evaluateState(domain: RealityDomain, evidence: readonly Evidence[], now: number): StateEvaluation {
  const policy = DOMAIN_CATALOG[domain];
  const base = { domain, policyVersion: TRUST_POLICY_VERSION, signals: [] as StateSignal[] };
  const active = evidence.filter((e) =>
    e.validUntil > now && e.observedAt <= now + 2_000 && e.value in policy.values &&
    Number.isFinite(e.confidence) && e.confidence > 0);
  if (!active.length) {
    return { ...base, truth: "UNKNOWN", value: null, freshness: null, safety: "NONE", confidence: 0, nature: null,
      observedAt: null, validUntil: null, supportingEvidenceIds: [], sourceIds: [], candidates: [], reason: "NO_ACTIVE_EVIDENCE" };
  }

  type Candidate = { value: string; weight: number; contributors: Set<string>; authoritative: boolean; items: Evidence[] };
  const byValue = new Map<string, Candidate>();
  for (const e of active) {
    const c = byValue.get(e.value) ?? { value: e.value, weight: 0, contributors: new Set<string>(), authoritative: false, items: [] };
    // Linear decay to 25% across the domain's aging window; a single source never exceeds its reliability.
    const age = Math.max(0, now - e.observedAt);
    const decay = Math.max(0.25, 1 - 0.75 * Math.min(1, age / policy.agingMs));
    const w = Math.min(1, e.confidence) * Math.min(1, e.sourceReliability) * decay;
    c.weight = 1 - (1 - c.weight) * (1 - w);
    if (e.contributor) c.contributors.add(e.contributor);
    if (isAuthoritative(e)) c.authoritative = true;
    c.items.push(e);
    byValue.set(e.value, c);
  }
  const candidates = [...byValue.values()].sort((a, b) => b.weight - a.weight);
  const credible = candidates.filter((c) => c.authoritative || c.contributors.size >= COMMUNITY_MIN_CONTRIBUTORS);
  const summary = candidates.map((c) => ({ value: c.value, weight: round(c.weight), contributors: c.contributors.size, authoritative: c.authoritative }));
  const signals: StateSignal[] = candidates
    .filter((c) => !c.authoritative && c.contributors.size > 0 && c.contributors.size < COMMUNITY_MIN_CONTRIBUTORS)
    .map((c) => ({ type: "REPORTED_UNVERIFIED", value: c.value, contributors: c.contributors.size, latestAt: Math.max(...c.items.map((i) => i.observedAt)) }));

  const newest = (items: Evidence[]) => items.reduce((a, b) => (b.observedAt > a.observedAt ? b : a));

  if (!credible.length) {
    const latest = newest(active);
    return { ...base, signals, truth: "UNKNOWN", value: null, freshness: freshnessFor(domain, now - latest.observedAt), safety: "NONE",
      confidence: 0, nature: null, observedAt: latest.observedAt, validUntil: null, supportingEvidenceIds: [], sourceIds: [],
      candidates: summary, reason: active.length === 1 ? "SINGLE_UNVERIFIED_REPORT" : "INSUFFICIENT_CORROBORATION" };
  }

  const leader = credible[0]!;
  const contender = credible.find((c) => c !== leader && c.weight >= leader.weight * CONFLICT_RATIO);
  if (contender) {
    const items = [...leader.items, ...contender.items];
    const latest = newest(items);
    return { ...base, signals, truth: "CONFLICT", value: null, freshness: freshnessFor(domain, now - latest.observedAt),
      safety: "NONE", confidence: round(Math.abs(leader.weight - contender.weight)), nature: latest.nature,
      observedAt: latest.observedAt, validUntil: null, supportingEvidenceIds: items.map((i) => i.id),
      sourceIds: [...new Set(items.map((i) => i.sourceId))], candidates: summary, reason: "CREDIBLE_DISAGREEMENT" };
  }

  const latest = newest(leader.items);
  const authoritativeLatest = leader.items.filter(isAuthoritative);
  const nature = authoritativeLatest.length ? newest(authoritativeLatest).nature : "COMMUNITY_REPORT";
  return {
    ...base,
    signals: signals.filter((s) => s.value !== leader.value),
    truth: "KNOWN",
    value: leader.value,
    freshness: freshnessFor(domain, now - latest.observedAt),
    safety: policy.values[leader.value]!.safety,
    confidence: round(leader.weight),
    nature,
    observedAt: latest.observedAt,
    validUntil: Math.max(...leader.items.map((i) => i.validUntil)),
    supportingEvidenceIds: leader.items.map((i) => i.id),
    sourceIds: [...new Set(leader.items.map((i) => i.sourceId))],
    candidates: summary,
    reason: "ESTABLISHED",
  };
}

function round(n: number): number { return Math.round(n * 1000) / 1000; }
