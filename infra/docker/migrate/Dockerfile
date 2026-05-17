FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/prisma ./packages/shared/prisma/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm install -g pnpm prisma@5 && pnpm install --filter @shorts/shared
WORKDIR /app/packages/shared
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
