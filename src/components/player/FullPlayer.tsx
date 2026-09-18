"use client";

import { useEffect } from "react";
import Image from "next/image";
import { ChevronDown, MoreHorizontal, Music2, Mic2, ListMusic } from "lucide-react";
import { clsx } from "clsx";
import { usePlayerStore } from "@/stores/player-store";
import { requestScreenWakeLock, releaseScreenWakeLock } from "@/player/background-audio";
import { PlayerControls } from "./PlayerControls";
import { SeekBar } from "./SeekBar";
import { QueuePanel } from "./QueuePanel";
import { LyricsPanel } from "./LyricsPanel";

interface FullPlayerProps {
  open: boolean;
  onClose: () => void;
}

export function FullPlayer({ open, onClose }: FullPlayerProps) {
  const { currentTrack, showQueue, showLyrics, setShowQueue, setShowLyrics } = usePlayerStore();

  useEffect(() => {
    if (open) {
      requestScreenWakeLock();
    } else {
      releaseScreenWakeLock();
    }
    return () => {
      releaseScreenWakeLock();
    };
  }, [open]);

  if (!currentTrack) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[60] flex flex-col md:hidden transition-transform duration-300 ease-out select-none",
        open ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none"
      )}
      style={{
        backgroundColor: "#0a0a0a",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(56, 189, 248, 0.08) 0%, #0a0a0a 75%)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      {/* Top Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-white/5"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          className="touch-target p-2 -ml-2 rounded-full transition-fast text-secondary hover:text-primary active:scale-95"
          aria-label="Close full player"
        >
          <ChevronDown size={24} />
        </button>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
          <button
            onClick={() => {
              setShowLyrics(false);
              setShowQueue(false);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-fast",
              !showLyrics && !showQueue
                ? "bg-accent text-black font-semibold shadow-sm"
                : "text-secondary hover:text-primary"
            )}
          >
            <Music2 size={13} />
            <span>Lagu</span>
          </button>
          <button
            onClick={() => {
              setShowLyrics(true);
              setShowQueue(false);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-fast",
              showLyrics
                ? "bg-accent text-black font-semibold shadow-sm"
                : "text-secondary hover:text-primary"
            )}
          >
            <Mic2 size={13} />
            <span>Lirik</span>
          </button>
          <button
            onClick={() => {
              setShowQueue(true);
              setShowLyrics(false);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-fast",
              showQueue
                ? "bg-accent text-black font-semibold shadow-sm"
                : "text-secondary hover:text-primary"
            )}
          >
            <ListMusic size={13} />
            <span>Antrean</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="touch-target p-2 -mr-2 rounded-full transition-fast text-secondary hover:text-primary opacity-0 pointer-events-none"
          aria-hidden="true"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {showQueue ? (
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <QueuePanel />
          </div>
        ) : showLyrics ? (
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <LyricsPanel />
          </div>
        ) : (
          /* Track details & main player view */
          <div className="flex-1 flex flex-col justify-between px-6 py-4 max-w-sm mx-auto w-full overflow-y-auto">
            {/* Album Artwork */}
            <div className="w-full flex items-center justify-center my-auto py-2">
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-overlay shrink-0">
                {currentTrack.artworkUrl ? (
                  <Image
                    src={currentTrack.artworkUrl}
                    alt={`${currentTrack.title} artwork`}
                    width={320}
                    height={320}
                    className="w-full h-full object-cover select-none"
                    priority
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface text-muted">
                    <Music2 size={48} />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Controls Group */}
            <div className="w-full shrink-0 pt-2 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
              {/* Track Info */}
              <div className="text-left mb-5">
                <h2
                  className="text-xl font-bold truncate tracking-tight"
                  style={{ color: "var(--color-text-primary)" }}
                  title={currentTrack.title}
                >
                  {currentTrack.title}
                </h2>
                <p
                  className="text-sm font-medium truncate mt-1"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {currentTrack.artist}
                </p>
                {currentTrack.album && (
                  <p
                    className="text-xs truncate mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {currentTrack.album}
                  </p>
                )}
              </div>

              {/* Seek bar */}
              <div className="w-full mb-6">
                <SeekBar />
              </div>

              {/* Playback Controls */}
              <div className="w-full">
                <PlayerControls size="lg" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
