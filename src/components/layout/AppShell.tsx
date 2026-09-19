"use client";

import { Sidebar } from "@/components/navigation/Sidebar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { DesktopPlayer } from "@/components/player/DesktopPlayer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full max-w-full overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 w-full max-w-full overflow-hidden">
        {/* Scrollable page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full md:pb-24 md:pt-3"
          style={{
            paddingBottom: "calc(8.5rem + env(safe-area-inset-bottom))",
          }}
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
