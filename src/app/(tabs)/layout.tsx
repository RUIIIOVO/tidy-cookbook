import { TabBar } from "@/components/tab-bar";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[520px] flex-col bg-paper shadow-[0_0_80px_rgba(0,0,0,0.06)]">
      <main className="relative z-10 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
