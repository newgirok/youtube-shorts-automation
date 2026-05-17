FROM node:20-slim
RUN apt-get update && apt-get install -y openssl ffmpeg fonts-nanum \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/shared/dist ./packages/shared/dist/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY apps/workers/render/dist ./apps/workers/render/dist/
COPY apps/workers/render/package.json ./apps/workers/render/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 && \
    pnpm install --filter @shorts/shared --filter @shorts/render-worker --prod && \
    prisma generate --schema=packages/shared/prisma/schema.prisma
WORKDIR /app/apps/workers/render
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
