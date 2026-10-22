import type { z } from "zod";
import { badRequest } from "./errors";

/** Parse untrusted input; error details carry paths and codes only (never echo the rejected value). */
export function parse<S extends z.ZodType>(schema: S, value: unknown, code = "VALIDATION_FAILED"): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw badRequest(code, result.error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    code: issue.code,
  })));
}

export function queryObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in out) throw badRequest("DUPLICATE_QUERY_PARAMETER", [{ path: key, code: "duplicate" }]);
    out[key] = value;
  }
  return out;
}
