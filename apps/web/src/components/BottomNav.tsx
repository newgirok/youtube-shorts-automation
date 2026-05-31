'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, Youtube, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useChannelStore } from '@/lib/store';

const YOUTUBE_CONNECT_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/auth/youtube`;

function openYoutubeConnect() {
  window.location.href = YOUTUBE_CONNECT_URL;
}

export function BottomNav() {
  const pathname = usePathname();
  const { selectedChannelId } = useChannelStore();
  const isConnected = Boolean(selectedChannelId);

  const items = [
    { href: '/', Icon: Home },
    ...(selectedChannelId ? [{ href: `/channels/${selectedChannelId}`, Icon: Settings }] : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/20 bg-black/80 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]">
      {items.map(({ href, Icon }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 items-center justify-center py-3 transition-colors',
              isActive ? 'text-white' : 'text-white/50 hover:text-white',
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
      <button
        onClick={openYoutubeConnect}
        className={cn(
          'flex flex-1 items-center justify-center py-3 transition-all',
          isConnected
            ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]'
            : 'text-white/50 hover:text-white',
        )}
      >
        <Youtube className="h-5 w-5" />
      </button>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex flex-1 items-center justify-center py-3 text-white/50 transition-colors hover:text-white"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </nav>
  );
}
