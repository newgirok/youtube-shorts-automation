FROM node:20-slim
RUN apt-get update && apt-get install -y openssl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/shared/dist ./packages/shared/dist/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY apps/workers/upload/dist ./apps/workers/upload/dist/
COPY apps/workers/upload/package.json ./apps/workers/upload/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 && \
    pnpm install --filter @shorts/shared --filter @shorts/upload-worker --prod && \
    DATABASE_URL=postgresql://x:x@localhost/x prisma generate --schema=packages/shared/prisma/schema.prisma
WORKDIR /app/apps/workers/upload
CMD ["node", "dist/local-runner.js"]
