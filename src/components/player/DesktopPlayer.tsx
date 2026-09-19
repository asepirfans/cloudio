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
    queuePulse,
  } = usePlayerStore();

  if (!currentTrack) {
    return (
      <div
        className="hidden md:block h-24 border-t"
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
        className="hidden md:flex h-24 border-t items-center px-6 gap-6 shrink-0 z-40"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        {/* Track info (left) */}
        <button
          className="flex items-center gap-3.5 min-w-0 w-60 shrink-0 cursor-pointer group"
          onClick={() => {
            setShowLyrics(false);
            setShowQueue(false);
            setShowFullPlayer(true);
          }}
          aria-label={`Now playing: ${currentTrack.title}. Klik untuk lihat detail.`}
        >
          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow-md transition-transform group-hover:scale-105">
            {currentTrack.artworkUrl ? (
              <Image
                src={currentTrack.artworkUrl}
                alt=""
                width={48}
                height={48}
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
              className="text-sm font-semibold truncate group-hover:text-sky-400 transition-colors"
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
        </button>

        {/* Center: controls + seekbar */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-w-0 max-w-xl mx-auto">
          <PlayerControls size="sm" />
          <div className="w-full">
            <SeekBar inline />
          </div>
        </div>

        {/* Right: volume + queue + lyrics */}
        <div className="flex items-center gap-2 w-60 shrink-0 justify-end">
          {/* Lyrics */}
          <button
            onClick={() => {
              if (showFullPlayer && showLyrics) {
                setShowFullPlayer(false);
                setShowLyrics(false);
              } else {
                setShowQueue(false);
                setShowLyrics(true);
                setShowFullPlayer(true);
              }
            }}
            className="touch-target rounded-lg transition-fast"
            style={{ color: showFullPlayer && showLyrics ? "var(--color-accent)" : "var(--color-text-muted)" }}
            aria-label="Toggle lyrics"
            aria-pressed={showFullPlayer && showLyrics}
          >
            <Mic2 size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>

          {/* Queue */}
          <button
            onClick={() => {
              if (showFullPlayer && showQueue) {
                setShowFullPlayer(false);
                setShowQueue(false);
              } else {
                setShowLyrics(false);
                setShowQueue(true);
                setShowFullPlayer(true);
              }
            }}
            className={`relative touch-target rounded-lg transition-all ${
              queuePulse ? "scale-125 text-sky-400" : ""
            }`}
            style={{ color: showFullPlayer && showQueue ? "var(--color-accent)" : queuePulse ? "#38bdf8" : "var(--color-text-muted)" }}
            aria-label="Toggle queue"
            aria-pressed={showFullPlayer && showQueue}
            title="Antrean Putar"
          >
            <ListMusic size={17} strokeWidth={1.8} aria-hidden="true" />
            {queuePulse && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
            )}
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
