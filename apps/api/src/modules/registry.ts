import type { Registrar } from "../app";
import { registerAdminRoutes } from "./admin";
import { registerDecisionRoutes } from "./decision";
import { registerJourneyRoutes } from "./journeys";
import { registerSeoRoutes } from "./seo";
import { registerStoryRoutes } from "./stories";
import { registerWatchAndPulseRoutes } from "./watch-pulse";

/** Modules registered after the foundation (identity, account, places, contribution, routing). */
export function registerAll(options: { transport?: typeof fetch } = {}): Registrar[] {
  return [
    registerDecisionRoutes,
    registerJourneyRoutes,
    registerWatchAndPulseRoutes,
    registerStoryRoutes,
    registerSeoRoutes,
    (router, deps) => registerAdminRoutes(router, deps, options.transport),
  ];
}
