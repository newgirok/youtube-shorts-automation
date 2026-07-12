import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone은 Docker 이미지 빌드(Phase 4+)에서만 활성화
  // Windows 로컬 빌드에서 symlink 권한 오류(EPERM) 방지
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3001'] },
  },
};

export default nextConfig;
