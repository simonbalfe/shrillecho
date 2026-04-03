FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app .
COPY . .
RUN pnpm --filter @repo/web build

FROM base AS production
COPY --from=deps /app .
COPY . .
COPY --from=build /app/apps/web/dist apps/web/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "tsx", "server.ts"]
