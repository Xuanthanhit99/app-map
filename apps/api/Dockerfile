# REALITY API + ingestion worker image (same image, different start command).
# Build context: repository root.
FROM node:22.22.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci --workspace @app-map/api --include-workspace-root=false --no-audit --no-fund \
 && npm cache clean --force

FROM node:22.22.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY apps/api ./apps/api
USER app
WORKDIR /app/apps/api
EXPOSE 3001
# Migrations run as a separate pre-deploy step (railway.api.json); default command serves HTTP.
CMD ["node", "--import", "tsx", "src/server.ts"]
