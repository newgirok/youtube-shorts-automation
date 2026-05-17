import { notFound } from 'next/navigation';
import { apiGet } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { ChannelClient } from './ChannelClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChannelPage({ params }: Props) {
  const { id } = await params;
  const channel = await apiGet<Channel>(`/channels/${id}`);
  if (!channel) notFound();

  return <ChannelClient channel={channel} />;
}
