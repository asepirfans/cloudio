"use client";

import { usePlayerStore } from "@/stores/player-store";
import { ListMusic, Check, X } from "lucide-react";

export function QueueToast() {
  const { toast, hideQueueToast, openQueue } = usePlayerStore();

  if (!toast) return null;

  return (
    <div
      className="fixed z-[9999] top-3 left-3 right-3 md:top-auto md:bottom-28 md:left-auto md:right-8 md:max-w-md animate-in fade-in slide-in-from-top-3 md:slide-in-from-bottom-3 duration-200 pointer-events-auto"
      style={{
        marginTop: "env(safe-area-inset-top, 0px)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-2xl"
        style={{
          backgroundColor: "rgba(18, 18, 22, 0.96)",
          borderColor: "rgba(56, 189, 248, 0.4)",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 15px rgba(56, 189, 248, 0.2)",
        }}
      >
        {/* Left: Icon & Text */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center shrink-0">
            <Check size={16} className="text-sky-300 stroke-[2.5]" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs font-semibold text-white truncate">
              {toast.trackTitle || "Lagu"}
            </p>
            <p className="text-[11px] text-sky-300/80 truncate font-medium">
              {toast.message}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              openQueue();
              hideQueueToast();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500 text-black text-xs font-semibold hover:bg-sky-400 active:scale-95 transition-all cursor-pointer touch-manipulation shadow-md shadow-sky-500/20"
          >
            <ListMusic size={13} strokeWidth={2.2} />
            <span>Lihat</span>
          </button>

          <button
            onClick={hideQueueToast}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer touch-manipulation"
            aria-label="Tutup notifikasi"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
