export class TransientError extends Error { constructor(readonly code: string) { super(code); this.name = "TransientError"; } }
export class PermanentError extends Error { constructor(readonly code: string) { super(code); this.name = "PermanentError"; } }

export type RetryOptions = { attempts: number; baseDelayMs: number; maxDelayMs: number; sleep?: (ms: number) => Promise<void>; random?: () => number };

/** Exponential backoff with full jitter. Only TransientError is retried. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<{ value: T; attempts: number }> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  let last: unknown;
  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    try { return { value: await fn(attempt), attempts: attempt }; }
    catch (e) {
      last = e;
      if (!(e instanceof TransientError) || attempt === o.attempts) break;
      await sleep(Math.floor(random() * Math.min(o.maxDelayMs, o.baseDelayMs * 2 ** (attempt - 1))));
    }
  }
  throw last;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export const CIRCUIT = { failureThreshold: 5, openMs: 10 * 60_000 } as const;

/** Pure circuit decision used by the persisted source_health row. */
export function circuitAllows(state: CircuitState, openedAt: Date | null, now: Date): { allowed: boolean; next: CircuitState } {
  if (state !== "OPEN") return { allowed: true, next: state };
  if (openedAt && now.getTime() - openedAt.getTime() >= CIRCUIT.openMs) return { allowed: true, next: "HALF_OPEN" };
  return { allowed: false, next: "OPEN" };
}

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number; maxBytes?: number }, transport: typeof fetch = fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let response: Response;
  try {
    response = await transport(url, { ...init, signal: controller.signal, redirect: "error" });
  } catch {
    throw new TransientError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
  } finally { clearTimeout(timer); }
  if (response.status === 429 || response.status >= 500) throw new TransientError(`HTTP_${response.status}`);
  if (!response.ok) throw new PermanentError(`HTTP_${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > (init.maxBytes ?? 20 * 1024 * 1024)) throw new PermanentError("RESPONSE_TOO_LARGE");
  try { return JSON.parse(text) as unknown; } catch { throw new PermanentError("INVALID_JSON"); }
}
