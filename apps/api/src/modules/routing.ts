import type { Router } from "../http/router";
import { ApiError, unavailable } from "../http/errors";
import { handleRoutingRequest } from "../routing-http-handler";
import type { AppDeps } from "./deps";

export function registerRoutingRoutes(router: Router, deps: AppDeps) {
  router.post("/v1/routing/route", async (ctx) => {
    if (!deps.routing) throw unavailable("ROUTING_PROVIDER_NOT_CONFIGURED");
    const result = await handleRoutingRequest(ctx.body, { primary: deps.routing, timeoutMs: 8_000 });
    if (result.status !== 200) throw new ApiError(result.status, "INVALID_REQUEST");
    return { body: result.body };
  }, { rateLimit: { name: "routing", limit: 30, windowMs: 60_000 } });
}
