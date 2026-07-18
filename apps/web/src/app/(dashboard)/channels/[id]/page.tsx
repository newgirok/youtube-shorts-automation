export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { apiGet } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { ChannelClient } from './ChannelClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChannelPage({ params }: Props) {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const userHeaders = userId ? { 'x-user-id': userId } : {};
  const { id } = await params;
  const channel = await apiGet<Channel>(`/channels/${id}`, userHeaders);
  if (!channel) notFound();

  return <ChannelClient channel={channel} userId={userId} />;
}
