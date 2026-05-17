import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-black">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        src="/bg.mp4"
      />
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative z-10 flex min-h-screen">
        <Sidebar />
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
