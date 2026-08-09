FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm --filter @meteorico/shared run build && \
    pnpm --filter @meteorico/domain run build && \
    pnpm --filter @meteorico/database run generate && \
    pnpm --filter @meteorico/database run build && \
    pnpm --filter @meteorico/api run build

FROM base AS production
RUN addgroup -g 1001 -S meteorico && adduser -S meteorico -u 1001
WORKDIR /app
COPY --from=build --chown=meteorico:meteorico /app .
USER meteorico
ENV NODE_ENV=production
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4080/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
