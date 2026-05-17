import { apiGet } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { HomeClient } from './HomeClient';

export default async function HomePage() {
  const channels = await apiGet<Channel[]>('/channels').catch(() => []);
  return <HomeClient channels={channels} />;
}
