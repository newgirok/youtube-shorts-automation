'use client';

import { Button } from '@/components/ui/button';

function openGoogleLogin() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    window.location.href = '/popup';
    return;
  }
  const width = 500;
  const height = 620;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2.5);
  window.open(
    '/popup',
    'google-signin',
    `popup,width=${width},height=${height},left=${left},top=${top}`,
  );
}

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2 overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        src="/bg.mp4"
      />
      {/* 왼쪽 패널 */}
      <div className="relative hidden lg:flex flex-col bg-black/60 backdrop-blur-sm p-10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-5 w-5 fill-white"
          >
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          YouTube Shorts Automation
        </div>

        <div className="mt-auto text-sm text-white/70">
          <p>
            &ldquo;주제를 입력하면 스크립트 작성, TTS 녹음, 영상 렌더링, YouTube 업로드를 자동으로 처리합니다.&rdquo;
          </p>
        </div>
      </div>

      {/* 오른쪽 패널 */}
      <div className="relative flex flex-col bg-black/40 backdrop-blur-sm">
        <div className="flex flex-1 items-center justify-center px-8 pb-16">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                로그인
              </h1>
            </div>

            <Button
              type="button"
              onClick={openGoogleLogin}
              className="w-full gap-2 bg-white text-zinc-900 hover:bg-white/90"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google로 계속하기
            </Button>

            <p className="text-center text-xs text-white/30">
              계속하면{' '}
              <span className="underline underline-offset-4 cursor-pointer hover:text-white/60">
                이용약관
              </span>{' '}
              및{' '}
              <span className="underline underline-offset-4 cursor-pointer hover:text-white/60">
                개인정보 처리방침
              </span>
              에 동의하는 것으로 간주합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
