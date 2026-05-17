'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Youtube, Settings, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useChannelStore } from '@/lib/store';

const YOUTUBE_CONNECT_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/auth/youtube`;

function openYoutubeConnect() {
  const width = 500;
  const height = 620;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2.5);
  window.open(YOUTUBE_CONNECT_URL, 'youtube-connect', `popup,width=${width},height=${height},left=${left},top=${top}`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { selectedChannelId } = useChannelStore();
  const isConnected = Boolean(selectedChannelId);

  return (
    <aside className="hidden md:flex w-14 shrink-0 flex-col bg-black/50 backdrop-blur-md border-r border-white/10">
      <nav className="flex flex-1 flex-col gap-1 px-2 pt-4">
        <Link
          href="/"
          title="홈"
          className={cn(
            'flex items-center justify-center rounded-md p-2.5 transition-colors',
            pathname === '/'
              ? 'bg-white/20 text-white'
              : 'text-white/50 hover:bg-white/10 hover:text-white',
          )}
        >
          <Home className="h-5 w-5" />
        </Link>

        {selectedChannelId && (
          <Link
            href={`/channels/${selectedChannelId}`}
            title="채널 정보"
            className={cn(
              'flex items-center justify-center rounded-md p-2.5 transition-colors',
              pathname.startsWith('/channels')
                ? 'bg-white/20 text-white'
                : 'text-white/50 hover:bg-white/10 hover:text-white',
            )}
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
      </nav>

      <div className="border-t border-white/10 p-2 flex flex-col gap-1">
        <button
          onClick={openYoutubeConnect}
          title={isConnected ? 'YouTube 채널 연결됨' : 'YouTube 채널 연결'}
          className={cn(
            'flex items-center justify-center rounded-md p-2.5 transition-all',
            isConnected
              ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.25)] ring-1 ring-white/30 hover:bg-white/25'
              : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white',
          )}
        >
          <Youtube className="h-5 w-5" />
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="로그아웃"
          className="flex items-center justify-center rounded-md p-2.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
