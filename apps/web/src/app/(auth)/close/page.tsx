'use client';

import { useEffect } from 'react';

export default function ClosePage() {
  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.location.href = '/';
      window.close();
    } else {
      window.location.href = '/';
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-sm text-white/50">로그인 완료 중...</p>
    </div>
  );
}
