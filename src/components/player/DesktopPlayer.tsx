"use client";

import Image from "next/image";
import { Volume2, VolumeX, ListMusic, Mic2 } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { PlayerControls } from "./PlayerControls";
import { SeekBar } from "./SeekBar";
import { FullPlayer } from "./FullPlayer";

export function DesktopPlayer() {
  const {
    currentTrack,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    setShowFullPlayer,
    showFullPlayer,
    setShowQueue,
    setShowLyrics,
    showQueue,
    showLyrics,
  } = usePlayerStore();

  if (!currentTrack) {
    return (
      <div
        className="hidden md:block h-20 border-t"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      />
    );
  }

  return (
    <>
      <div
        className="hidden md:flex h-20 border-t items-center px-4 gap-4 shrink-0"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        {/* Track info (left) */}
        <button
          className="flex items-center gap-3 min-w-0 w-52 shrink-0 cursor-pointer"
          onClick={() => setShowFullPlayer(true)}
          aria-label={`Now playing: ${currentTrack.title}`}
        >
          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0">
            {currentTrack.artworkUrl ? (
              <Image
                src={currentTrack.artworkUrl}
                alt=""
                width={44}
                height={44}
                className="w-full h-full object-cover"
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full" style={{ backgroundColor: "var(--color-elevated)" }} />
            )}
          </div>
          <div className="min-w-0 text-left">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {currentTrack.title}
            </p>
            <p
              className="text-xs truncate"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {currentTrack.artist}
            </p>
          </div>
        </button>

        {/* Center: controls + seekbar */}
        <div className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0">
          <PlayerControls size="sm" />
          <div className="w-full max-w-lg">
            <SeekBar />
          </div>
        </div>

        {/* Right: volume + queue + lyrics */}
        <div className="flex items-center gap-1 w-52 shrink-0 justify-end">
          {/* Lyrics */}
          <button
            onClick={() => { setShowLyrics(!showLyrics); setShowQueue(false); }}
            className="touch-target rounded-lg transition-fast"
            style={{ color: showLyrics ? "var(--color-accent)" : "var(--color-text-muted)" }}
            aria-label="Toggle lyrics"
            aria-pressed={showLyrics}
          >
            <Mic2 size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>

          {/* Queue */}
          <button
            onClick={() => { setShowQueue(!showQueue); setShowLyrics(false); }}
            className="touch-target rounded-lg transition-fast"
            style={{ color: showQueue ? "var(--color-accent)" : "var(--color-text-muted)" }}
            aria-label="Toggle queue"
            aria-pressed={showQueue}
          >
            <ListMusic size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>

          {/* Volume */}
          <button
            onClick={toggleMute}
            className="touch-target rounded-lg transition-fast"
            style={{ color: "var(--color-text-muted)" }}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={17} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Volume2 size={17} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 accent-[#38bdf8] cursor-pointer"
            aria-label="Volume"
          />
        </div>
      </div>

      {/* Full player overlay (desktop too) */}
      <FullPlayer open={showFullPlayer} onClose={() => setShowFullPlayer(false)} />
    </>
  );
}
