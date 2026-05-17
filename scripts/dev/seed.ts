// DB 시드 데이터 삽입 스크립트
import { prisma } from '@shorts/shared';

async function main() {
  console.log('Seeding database...');
  // TODO: 시드 데이터 추가
  await prisma.$disconnect();
}

main().catch(console.error);
