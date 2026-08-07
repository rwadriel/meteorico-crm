FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY . .
RUN pnpm --filter @meteorico/shared run build && \
    pnpm --filter @meteorico/domain run build && \
    pnpm --filter @meteorico/database run generate && \
    pnpm --filter @meteorico/database run build && \
    pnpm --filter @meteorico/api run build

FROM node:20-alpine AS production
RUN addgroup -g 1001 -S meteorico && adduser -S meteorico -u 1001
WORKDIR /app
COPY --from=build --chown=meteorico:meteorico /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=meteorico:meteorico /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=meteorico:meteorico /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=meteorico:meteorico /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=meteorico:meteorico /app/packages/domain/dist ./packages/domain/dist
COPY --from=build --chown=meteorico:meteorico /app/packages/domain/package.json ./packages/domain/
COPY --from=build --chown=meteorico:meteorico /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=meteorico:meteorico /app/packages/database/package.json ./packages/database/
COPY --from=build --chown=meteorico:meteorico /app/packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=meteorico:meteorico /app/packages/database/node_modules/.prisma ./packages/database/node_modules/.prisma
COPY --from=build --chown=meteorico:meteorico /app/node_modules ./node_modules
COPY --from=build --chown=meteorico:meteorico /app/package.json ./
COPY --from=build --chown=meteorico:meteorico /app/pnpm-workspace.yaml ./
USER meteorico
ENV NODE_ENV=production
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4080/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
