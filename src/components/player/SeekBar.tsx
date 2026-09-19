"use client";

import { useCallback } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { getAudioElement } from "@/player/audio-engine";

interface SeekBarProps {
  compact?: boolean;
  inline?: boolean;
  showRemaining?: boolean;
  spotifyStyle?: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SeekBar({
  compact = false,
  inline = false,
  showRemaining = false,
  spotifyStyle = false,
}: SeekBarProps) {
  const { currentTime, duration, seek } = usePlayerStore();

  const displayCurrentTime = duration > 0 ? Math.min(currentTime, duration) : currentTime;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (displayCurrentTime / duration) * 100)) : 0;

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const newTime = ratio * duration;
      seek(newTime);
      const audio = getAudioElement();
      if (audio) audio.currentTime = newTime;
    },
    [duration, seek]
  );

  const handleTouchSeek = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      seek(newTime);
      const audio = getAudioElement();
      if (audio) audio.currentTime = newTime;
    },
    [duration, seek]
  );

  if (inline) {
    return (
      <div className="flex items-center gap-3 w-full">
        <span
          className="text-[11px] font-mono tabular-nums shrink-0 w-8 text-right select-none"
          style={{ color: "var(--color-text-muted)" }}
        >
          {formatTime(displayCurrentTime)}
        </span>
        <div
          role="slider"
          aria-label="Track position"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          aria-valuetext={formatTime(currentTime)}
          tabIndex={0}
          onClick={handleSeek}
          onTouchMove={handleTouchSeek}
          onTouchEnd={handleTouchSeek}
          className="relative flex-1 h-3 flex items-center cursor-pointer group"
          style={{ touchAction: "none" }}
        >
          <div
            className="w-full h-1 rounded-full overflow-hidden transition-all group-hover:h-1.5"
            style={{ backgroundColor: "var(--color-border)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: "var(--color-accent)",
              }}
            />
          </div>

          {/* Thumb — visible on desktop hover */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-fast"
            style={{
              left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: "var(--color-text-primary)",
            }}
          />
        </div>
        <span
          className="text-[11px] font-mono tabular-nums shrink-0 w-8 select-none"
          style={{ color: "var(--color-text-muted)" }}
        >
          {formatTime(duration)}
        </span>
      </div>
    );
  }

  if (spotifyStyle) {
    return (
      <div className="w-full px-0.5 select-none">
        {/* Track bar touch container */}
        <div
          role="slider"
          aria-label="Track position"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          aria-valuetext={formatTime(currentTime)}
          tabIndex={0}
          onClick={handleSeek}
          onTouchMove={handleTouchSeek}
          onTouchEnd={handleTouchSeek}
          className="relative w-full cursor-pointer py-3 flex items-center"
          style={{ touchAction: "none" }}
        >
          {/* Track Rail Container (4px height) */}
          <div className="relative w-full h-1 bg-white/20 rounded-full">
            {/* Filled progress */}
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{ width: `${progress}%` }}
            />

            {/* White Thumb - Exactly centered on the 4px rail */}
            <div
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${progress}%`,
              }}
            />
          </div>
        </div>

        {/* Time labels */}
        <div className="flex justify-between -mt-1 px-0.5">
          <span className="text-[11px] font-medium text-white/50 tracking-tight select-none">
            {formatTime(displayCurrentTime)}
          </span>
          <span className="text-[11px] font-medium text-white/50 tracking-tight select-none">
            {showRemaining && duration > 0
              ? `-${formatTime(Math.max(0, duration - displayCurrentTime))}`
              : formatTime(duration)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "w-full" : "w-full px-1"}>
      {/* Track bar */}
      <div
        role="slider"
        aria-label="Track position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTime(currentTime)}
        tabIndex={0}
        onClick={handleSeek}
        onTouchMove={handleTouchSeek}
        onTouchEnd={handleTouchSeek}
        className={`relative w-full cursor-pointer group ${compact ? "h-1" : "h-1 py-3"}`}
        style={{ touchAction: "none" }}
      >
        <div
          className={`absolute top-1/2 -translate-y-1/2 left-0 right-0 ${compact ? "h-0.5" : "h-1"} rounded-full overflow-hidden`}
          style={{ backgroundColor: "var(--color-border)" }}
        >
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${progress}%`,
              backgroundColor: "var(--color-accent)",
            }}
          />
        </div>

        {/* Thumb — visible on desktop hover */}
        {!compact && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-fast"
            style={{
              left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: "var(--color-text-primary)",
            }}
          />
        )}
      </div>

      {/* Time labels */}
      {!compact && (
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {formatTime(displayCurrentTime)}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {showRemaining && duration > 0
              ? `-${formatTime(Math.max(0, duration - displayCurrentTime))}`
              : formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}

