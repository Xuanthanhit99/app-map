export type ErrorDetail = { path: string; code: string; message?: string };

/** Uniform error envelope: { error: CODE, message?, details?, requestId }. CODE is stable and machine-readable. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly details?: ErrorDetail[],
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export const badRequest = (code = "INVALID_REQUEST", details?: ErrorDetail[]) => new ApiError(400, code, undefined, details);
export const unauthorized = (code = "UNAUTHENTICATED") => new ApiError(401, code, undefined, undefined, { "WWW-Authenticate": 'Bearer realm="reality"' });
export const forbidden = (code = "FORBIDDEN") => new ApiError(403, code);
export const notFound = (code = "NOT_FOUND") => new ApiError(404, code);
export const conflict = (code: string) => new ApiError(409, code);
export const tooMany = (retryAfterSeconds: number, code = "RATE_LIMITED") =>
  new ApiError(429, code, undefined, undefined, { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) });
export const unavailable = (code: string) => new ApiError(503, code);
