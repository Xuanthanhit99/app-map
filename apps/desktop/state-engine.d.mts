export type TruthStatus = "KNOWN" | "UNKNOWN" | "CONFLICT";
export type Freshness = "FRESH" | "AGING" | "STALE";
export declare const TRUTH: readonly TruthStatus[];
export declare const FRESHNESS: readonly Freshness[];
export interface EvidenceInput { truth?: TruthStatus; observedAt?: string; source?: string }
export interface EvidenceResolution { truth: TruthStatus; freshness: Freshness | null; label: string; safeToAssert: boolean }
export declare function resolveEvidence(input: EvidenceInput | null | undefined, now?: number): EvidenceResolution;
export declare function resolveCollection<T>(value: { status?: string; items?: T[] } | null | undefined): { status: "loading" | "error" | "empty" | "ready"; items: T[] };
