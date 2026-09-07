'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { useChannelStore } from '@/lib/store';
import { apiDelete } from '@/lib/api';

export function useYoutubeConnect() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedChannelId, clearSelectedChannelId } = useChannelStore();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? '';
  const isConnected = Boolean(selectedChannelId);

  function openYoutubeConnect() {
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
    try {
      await apiDelete(`/channels/${selectedChannelId}`, userId ? { 'x-user-id': userId } : {});
    } catch {
      window.alert('채널 연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    clearSelectedChannelId();
    queryClient.removeQueries({ queryKey: ['jobs'] });
    queryClient.removeQueries({ queryKey: ['channel'] });
    queryClient.removeQueries({ queryKey: ['analytics'] });
    await queryClient.invalidateQueries({ queryKey: ['channels'] });
    router.push('/');
    router.refresh();
  }

  return { isConnected, handleYoutubeClick };
}
