import type { Registrar } from "../app";

/** Modules added after the foundation register here (decision, journeys, watch, pulse, stories, admin, seo…). */
export function registerAll(): Registrar[] {
  return [];
}
