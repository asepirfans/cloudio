"use client";

import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { usePlayerStore } from "@/stores/player-store";
import { getAudio } from "@/player/audio-engine";
import type { RepeatMode } from "@/types/music";

interface PlayerControlsProps {
  size?: "sm" | "md" | "lg";
}

export function PlayerControls({ size = "md" }: PlayerControlsProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    status,
    shuffle,
    repeatMode,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    setRepeatMode,
  } = usePlayerStore();

  const iconSize = size === "lg" ? 24 : size === "sm" ? 16 : 20;
  const playIconSize = size === "lg" ? 26 : size === "sm" ? 18 : 22;

  const nextRepeatMode = (current: RepeatMode): RepeatMode => {
    if (current === "off") return "queue";
    if (current === "queue") return "track";
    return "off";
  };

  const isLoading = status === "RESOLVING" || status === "LOADING" || isBuffering;

  const handlePlayPause = () => {
    const audio = getAudio();
    if (isPlaying) {
      audio.pause();
      usePlayerStore.getState().pause();
    } else {
      audio.play().catch(() => {});
      usePlayerStore.getState().play();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Shuffle */}
      <button
        onClick={toggleShuffle}
        className={clsx(
            "touch-target rounded-lg transition-fast",
          shuffle ? "text-accent" : "text-muted hover:text-secondary"
        )}
        aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
        aria-pressed={shuffle}
      >
        <Shuffle size={iconSize} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {/* Previous */}
      <button
        onClick={previous}
        className="touch-target rounded-lg transition-fast text-secondary hover:text-primary"
        aria-label="Previous track"
      >
        <SkipBack size={iconSize} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className={clsx(
          "touch-target rounded-full transition-fast flex items-center justify-center cursor-pointer touch-manipulation active:scale-95",
          size === "lg" ? "w-14 h-14" : "w-11 h-11"
        )}
        style={{ backgroundColor: "var(--color-text-primary)" }}
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!currentTrack}
      >
        {isLoading ? (
          <Loader2
            size={playIconSize}
            className="animate-spin"
            style={{ color: "var(--color-bg)" }}
            aria-hidden="true"
          />
        ) : isPlaying ? (
          <Pause
            size={playIconSize}
            strokeWidth={2}
            style={{ color: "var(--color-bg)" }}
            aria-hidden="true"
          />
        ) : (
          <Play
            size={playIconSize}
            strokeWidth={2}
            className="translate-x-0.5"
            style={{ color: "var(--color-bg)" }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Next */}
      <button
        onClick={next}
        className="touch-target rounded-lg transition-fast text-secondary hover:text-primary"
        aria-label="Next track"
      >
        <SkipForward size={iconSize} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {/* Repeat */}
      <button
        onClick={() => setRepeatMode(nextRepeatMode(repeatMode))}
        className={clsx(
          "touch-target rounded-lg transition-fast",
          repeatMode !== "off" ? "text-accent" : "text-muted hover:text-secondary"
        )}
        aria-label={`Repeat mode: ${repeatMode}`}
        aria-pressed={repeatMode !== "off"}
      >
        {repeatMode === "track" ? (
          <Repeat1 size={iconSize} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <Repeat size={iconSize} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
