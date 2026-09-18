"use client";
import Image from "next/image";
import { Play, Pause } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { FullPlayer } from "./FullPlayer";

export function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    showFullPlayer,
    setShowFullPlayer,
  } = usePlayerStore();

  if (!currentTrack) return null;

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <>
      {/* Mini player bar - mobile only (sits above BottomNav, hidden when FullPlayer is expanded) */}
      {!showFullPlayer && (
        <div
          className="fixed left-0 right-0 z-30 md:hidden animate-in fade-in duration-200"
          style={{ bottom: `calc(3.5rem + env(safe-area-inset-bottom))` }}
        >
          <div
            role="button"
            tabIndex={0}
            className="w-full block cursor-pointer"
            onClick={() => setShowFullPlayer(true)}
            onKeyDown={(e) => e.key === "Enter" && setShowFullPlayer(true)}
            aria-label={`Now playing: ${currentTrack.title} by ${currentTrack.artist}. Tap to open player.`}
          >
            <div
              className="mx-2 rounded-xl border overflow-hidden shadow-lg backdrop-blur-md"
              style={{
                backgroundColor: "rgba(24, 24, 27, 0.95)",
                borderColor: "var(--color-border)",
              }}
            >
              {/* Content row */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                {/* Artwork */}
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-overlay border border-white/5">
                  {currentTrack.artworkUrl ? (
                    <Image
                      src={currentTrack.artworkUrl}
                      alt={`${currentTrack.title} artwork`}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full" style={{ backgroundColor: "var(--color-overlay)" }} />
                  )}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {currentTrack.title}
                  </p>
                  <p
                    className="text-xs truncate mt-0.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {currentTrack.artist}
                  </p>
                </div>

                {/* Play/pause button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="touch-target p-2 rounded-full transition-fast shrink-0 text-primary hover:text-accent active:scale-95"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={22} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Play size={22} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Progress bar */}
              <div
                className="h-0.5 w-full"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Player modal overlay */}
      <FullPlayer open={showFullPlayer} onClose={() => setShowFullPlayer(false)} />
    </>
  );
}
