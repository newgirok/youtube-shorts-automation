export const dynamic = 'force-dynamic';

import { auth } from '@/auth';
import { apiGet } from '@/lib/api';
import type { Channel, Job } from '@/lib/types';
import { HomeClient } from './HomeClient';

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const userHeaders = userId ? { 'x-user-id': userId } : {};
  const channels = await apiGet<Channel[]>('/channels', userHeaders).catch(() => []);
  const firstChannelId = channels[0]?.id ?? '';
  const initialJobs = firstChannelId
    ? await apiGet<Job[]>(`/jobs?channelId=${firstChannelId}`, userHeaders).catch(() => [])
    : [];
  return <HomeClient channels={channels} userId={userId} firstChannelId={firstChannelId} initialJobs={initialJobs} />;
}
