export const metadata = {
  title: '이용약관 | Shorts Automation',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white/80 px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">이용약관</h1>
      <p className="text-xs text-white/30 mb-10">최종 수정일: 2026년 7월 14일</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">1. 서비스 개요</h2>
        <p className="text-sm leading-7">
          본 서비스는 YouTube 채널 운영자가 뉴스 기반 Shorts 영상을 자동으로 생성·업로드할 수 있도록
          지원하는 내부 도구입니다. Google OAuth를 통해 인증된 사용자만 접근할 수 있습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">2. 계정 및 접근</h2>
        <p className="text-sm leading-7">
          서비스에 접근하려면 Google 계정으로 로그인해야 합니다. 본 서비스는 승인된 사용자에게만
          제공되며, 계정 공유나 무단 접근 시도는 금지됩니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">3. YouTube API 사용</h2>
        <p className="text-sm leading-7">
          본 서비스는 YouTube Data API를 사용하여 영상을 업로드하고 채널 정보를 조회합니다.
          YouTube API 서비스 이용약관(
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            https://www.youtube.com/t/terms
          </a>
          )이 함께 적용됩니다. 또한 Google 개인정보 처리방침(
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            https://policies.google.com/privacy
          </a>
          )도 적용됩니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">4. 콘텐츠 책임</h2>
        <p className="text-sm leading-7">
          AI가 생성한 스크립트는 공개된 뉴스 정보를 기반으로 하며, 업로드 전 내용을 검토할
          책임은 사용자에게 있습니다. 저작권 침해 또는 YouTube 정책 위반으로 인한 결과에 대해
          서비스 운영자는 책임지지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">5. 면책</h2>
        <p className="text-sm leading-7">
          본 서비스는 있는 그대로(as-is) 제공되며, 영상 생성 실패·업로드 오류·YouTube 정책 변경
          등으로 인한 손해에 대해 보증하지 않습니다.
        </p>
      </section>

      <p className="text-xs text-white/30 mt-12">문의: fingercloud5900@gmail.com</p>
    </div>
  );
}
