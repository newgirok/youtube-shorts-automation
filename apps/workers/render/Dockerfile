FROM node:20-slim

# aws-lambda-ric 빌드 의존성 포함
RUN apt-get update && apt-get install -y \
    openssl ffmpeg fonts-nanum fonts-nanum-extra \
    python3 make g++ cmake autoconf automake libtool pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY packages/shared/dist ./packages/shared/dist/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY apps/workers/render/dist ./apps/workers/render/dist/
COPY apps/workers/render/package.json ./apps/workers/render/
COPY scripts/fonts/SBAggro-Bold.ttf ./fonts/SBAggro-Bold.ttf
RUN cp ./fonts/SBAggro-Bold.ttf /usr/local/share/fonts/ && fc-cache -fv
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 aws-lambda-ric && \
    pnpm install --filter @shorts/shared --filter @shorts/render-worker --prod && \
    prisma generate --schema=packages/shared/prisma/schema.prisma

WORKDIR /app/apps/workers/render
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe
ENV FONTS_DIR=/app/fonts
ENV NODE_ENV=production

ENTRYPOINT ["/usr/local/bin/aws-lambda-ric"]
CMD ["dist/handler.handler"]
