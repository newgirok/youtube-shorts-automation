FROM node:20-slim

RUN apt-get update && apt-get install -y openssl python3 python3-pip ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY packages/shared/dist ./packages/shared/dist/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY apps/workers/subtitle/dist ./apps/workers/subtitle/dist/
COPY apps/workers/subtitle/package.json ./apps/workers/subtitle/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 && \
    pnpm install --filter @shorts/shared --filter @shorts/subtitle-worker --prod && \
    prisma generate --schema=packages/shared/prisma/schema.prisma

WORKDIR /app/apps/workers/subtitle

ENV PYTHON_PATH=python3
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
