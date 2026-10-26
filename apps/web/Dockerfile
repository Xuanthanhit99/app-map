# REALITY web (Next.js standalone). Build context: repository root.
FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci --workspace @app-map/web --include-workspace-root=false --no-audit --no-fund
COPY src ./src
COPY apps/web ./apps/web
# Public build-time values only (never secrets).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAP_STYLE_URL
ARG NEXT_PUBLIC_MAP_TILE_HOSTS
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @app-map/web

FROM node:22.22.0-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
