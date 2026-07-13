export const metadata = {
  title: '개인정보 처리방침 | Shorts Automation',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white/80 px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">개인정보 처리방침</h1>
      <p className="text-xs text-white/30 mb-10">최종 수정일: 2026년 7월 14일</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">1. 수집하는 정보</h2>
        <p className="text-sm leading-7 mb-3">Google 로그인 시 다음 정보를 수집합니다:</p>
        <ul className="text-sm leading-7 list-disc list-inside space-y-1 text-white/70">
          <li>Google 계정 이메일 및 프로필 정보 (인증 목적)</li>
          <li>YouTube 채널 ID 및 채널 메타데이터</li>
          <li>YouTube OAuth 리프레시 토큰 (영상 업로드 권한)</li>
          <li>서비스 이용 중 생성된 영상 스크립트, 업로드 내역</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">2. 정보 이용 목적</h2>
        <ul className="text-sm leading-7 list-disc list-inside space-y-1 text-white/70">
          <li>YouTube Shorts 영상 자동 생성 및 업로드</li>
          <li>채널 통계 조회 및 대시보드 표시</li>
          <li>업로드 스케줄 관리</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">3. 정보 보관 및 보안</h2>
        <p className="text-sm leading-7">
          OAuth 리프레시 토큰은 AES-256-GCM으로 암호화하여 데이터베이스에 저장합니다.
          액세스 토큰은 서버 메모리에서만 사용하며 저장하지 않습니다.
          서비스 이용을 중단하면 요청에 따라 모든 데이터를 삭제합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">4. 제3자 공유</h2>
        <p className="text-sm leading-7">
          수집한 개인정보 및 YouTube API 데이터는 제3자에게 판매하거나 공유하지 않습니다.
          YouTube Data API를 통해 얻은 데이터는 본 서비스의 핵심 기능 외 목적으로 사용하지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">5. Google API 데이터 사용 제한</h2>
        <p className="text-sm leading-7">
          본 서비스의 Google API 데이터 사용 및 이전은{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            Google API 서비스 사용자 데이터 정책
          </a>
          을 준수하며, Limited Use 요건을 포함합니다.
          YouTube OAuth를 통해 취득한 데이터는 해당 사용자의 YouTube 채널 운영 목적으로만 사용합니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-white mb-3">6. 데이터 삭제 요청</h2>
        <p className="text-sm leading-7">
          Google 계정 연결 해제는 대시보드 내 채널 연결 해제 버튼을 통해 즉시 처리됩니다.
          계정 및 관련 데이터 완전 삭제를 원하시면 아래 이메일로 문의해 주세요.
        </p>
      </section>

      <p className="text-xs text-white/30 mt-12">문의: fingercloud5900@gmail.com</p>
    </div>
  );
}
