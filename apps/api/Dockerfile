FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS runtime
COPY --from=deps /app ./
COPY apps/api apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@repo/api", "exec", "tsx", "src/dev.ts"]
