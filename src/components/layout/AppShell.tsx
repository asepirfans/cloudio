"use client";

import { Sidebar } from "@/components/navigation/Sidebar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { DesktopPlayer } from "@/components/player/DesktopPlayer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Scrollable page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto
            /* mobile: pad bottom for mini player + nav */
            pb-[calc(theme(spacing.14)+env(safe-area-inset-bottom)+theme(spacing.20))]
            /* desktop: pad bottom for persistent player */
            md:pb-24"
        >
          {children}
        </main>

        {/* Desktop persistent bottom player */}
        <DesktopPlayer />
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
}
