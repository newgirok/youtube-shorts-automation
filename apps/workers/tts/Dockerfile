FROM node:20-slim
RUN apt-get update && apt-get install -y openssl python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install edge-tts --break-system-packages
WORKDIR /app
COPY packages/shared/dist ./packages/shared/dist/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY apps/workers/tts/dist ./apps/workers/tts/dist/
COPY apps/workers/tts/package.json ./apps/workers/tts/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 && \
    pnpm install --filter @shorts/shared --filter @shorts/tts-worker --prod && \
    DATABASE_URL=postgresql://x:x@localhost/x prisma generate --schema=packages/shared/prisma/schema.prisma
WORKDIR /app/apps/workers/tts
ENV EDGE_TTS_PATH=edge-tts
CMD ["node", "dist/local-runner.js"]
