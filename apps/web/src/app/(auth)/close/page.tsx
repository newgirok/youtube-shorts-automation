'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function ClosePageInner() {
  const params = useSearchParams();
  const channelId = params.get('channelId');
  const authError = params.get('auth_error');
  const dest = channelId ? `/channels/${channelId}` : `/${authError ? `?auth_error=${encodeURIComponent(authError)}` : ''}`;

  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.location.href = dest;
      window.close();
    } else {
      window.location.href = dest;
    }
  }, [dest]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-sm text-white/50">로그인 완료 중...</p>
    </div>
  );
}

export default function ClosePage() {
  return (
    <Suspense>
      <ClosePageInner />
    </Suspense>
  );
}
