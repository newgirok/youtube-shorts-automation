import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // standalone은 Docker 이미지 빌드(Phase 4+)에서만 활성화
  // Windows 로컬 빌드에서 symlink 권한 오류(EPERM) 방지
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // @prisma/client를 번들하지 않고 런타임 require()로 로드 (engine 바이너리 경로 보존)
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3001'] },
    // pnpm 모노레포에서 packages/shared 등 상위 경로 파일을 standalone에 포함
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

export default nextConfig;
