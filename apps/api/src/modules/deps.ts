import type { Db } from "../db/pool";
import type { AppConfig } from "../config";
import type { RateLimitStore } from "../http/rate-limit";
import type { RoutingProvider } from "../../../../src/routing/routing-contract";
import type { OidcProviderConfig, VerifiedIdentity } from "../lib/oidc";
import type { Mailer } from "../lib/mailer";
import type { PushSender } from "../lib/push";

export type AppDeps = {
  db: Db;
  config: AppConfig;
  rateLimits: RateLimitStore;
  now: () => Date;
  routing: RoutingProvider | null;
  verifyIdToken: (token: string, config: OidcProviderConfig) => Promise<VerifiedIdentity>;
  mailer: Mailer;
  push: PushSender;
};
