import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

const OG_IMAGE = 'https://shorts-static-682251233572.s3.ap-northeast-2.amazonaws.com/og-image.png';

export const metadata: Metadata = {
  title: 'YouTube Shorts Automation',
  description: '주제를 입력하면 AI가 스크립트, TTS, 영상 렌더링, YouTube 업로드를 자동으로 처리합니다.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'YouTube Shorts Automation',
    description: '주제를 입력하면 AI가 스크립트, TTS, 영상 렌더링, YouTube 업로드를 자동으로 처리합니다.',
    type: 'website',
    images: [{ url: OG_IMAGE, width: 1280, height: 720, alt: 'YouTube Shorts Automation' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube Shorts Automation',
    description: '주제를 입력하면 AI가 스크립트, TTS, 영상 렌더링, YouTube 업로드를 자동으로 처리합니다.',
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
