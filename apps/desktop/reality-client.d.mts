export interface CollectionResult<T = Record<string, unknown>> { status: "loading" | "error" | "empty" | "ready"; items: T[]; reason?: string }
export declare function loadReality(baseUrl: string, fetcher?: typeof fetch, signal?: AbortSignal): Promise<CollectionResult>;
export declare function loadDecisionPlans(baseUrl: string, fetcher?: typeof fetch, signal?: AbortSignal): Promise<CollectionResult>;
