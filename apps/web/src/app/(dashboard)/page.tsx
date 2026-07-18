export const dynamic = 'force-dynamic';

import { auth } from '@/auth';
import { apiGet } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { HomeClient } from './HomeClient';

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const userHeaders = userId ? { 'x-user-id': userId } : {};
  const channels = await apiGet<Channel[]>('/channels', userHeaders).catch(() => []);
  return <HomeClient channels={channels} userId={userId} />;
}
