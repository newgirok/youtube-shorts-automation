FROM node:20-bullseye-slim AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @shorts/shared prisma:generate && pnpm --filter @shorts/shared build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_SECRET
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_SECRET=$NEXT_PUBLIC_API_SECRET
RUN DOCKER_BUILD=true pnpm --filter web build
# Prisma 엔진 바이너리를 고정 경로에 집결 (runner 스테이지에서 COPY --from 사용)
RUN find /app -name "libquery_engine-debian-openssl-1.1.x.so.node" | head -1 | xargs -I{} cp {} /tmp/prisma-engine-debian.so.node

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Prisma Query Engine — standalone 빌드가 .so.node를 자동 포함하지 않으므로 명시 복사
RUN mkdir -p ./apps/web/.prisma/client
COPY --from=builder /tmp/prisma-engine-debian.so.node ./apps/web/.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node
EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/web/server.js"]
