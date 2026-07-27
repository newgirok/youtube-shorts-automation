'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useChannelStore } from '@/lib/store';
import { apiDelete } from '@/lib/api';

export function useYoutubeConnect() {
  const router = useRouter();
  const { selectedChannelId, clearSelectedChannelId } = useChannelStore();
  const { data: session } = useSession();
  const isConnected = Boolean(selectedChannelId);

  function openYoutubeConnect() {
    const userId = session?.user?.id ?? '';
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    const url = `${base}/auth/youtube?userId=${encodeURIComponent(userId)}`;
    const width = 500;
    const height = 620;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2.5);
    window.open(url, 'youtube-connect', `popup,width=${width},height=${height},left=${left},top=${top}`);
  }

  async function handleYoutubeClick() {
    if (!isConnected) {
      openYoutubeConnect();
      return;
    }
    if (!window.confirm('채널 연결을 해제하시겠습니까?')) return;
    await apiDelete(`/channels/${selectedChannelId}`).catch(() => {});
    clearSelectedChannelId();
    router.push('/');
  }

  return { isConnected, handleYoutubeClick };
}
