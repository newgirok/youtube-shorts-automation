'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';

export default function PopupPage() {
  useEffect(() => {
    signIn('google', { callbackUrl: '/close' });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-sm text-white/50">Google 로그인으로 이동 중...</p>
    </div>
  );
}
