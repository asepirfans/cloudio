"use client";

import Image from "next/image";
import { Play, MoreHorizontal } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TrackRowProps {
  track: Track;
  index?: number;
  queue?: Track[];
  useSmartQueue?: boolean;
  onMenuClick?: (track: Track, e: React.MouseEvent) => void;
}

export function TrackRow({ track, index, queue, useSmartQueue, onMenuClick }: TrackRowProps) {
  const { currentTrack, isPlaying, setQueue, play, playSmartQueue, queue: storeQueue } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;
  const isUnavailable = track.availability === "UNAVAILABLE";

  const handlePlay = () => {
    if (isUnavailable) return;
    if (isActive) {
      usePlayerStore.getState().togglePlay();
      return;
    }
    if (useSmartQueue) {
      playSmartQueue(track);
      return;
    }
    const playQueue = queue ?? storeQueue;
    const idx = playQueue.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      setQueue(playQueue, idx);
    } else {
      play(track);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg group transition-fast cursor-pointer ${
        isUnavailable ? "opacity-40 cursor-not-allowed" : "hover:bg-elevated"
      }`}
      onClick={handlePlay}
      role="button"
      aria-label={`Play ${track.title} by ${track.artist}`}
      aria-disabled={isUnavailable}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handlePlay()}
    >
      {/* Index / active indicator */}
      <div className="w-7 text-center shrink-0">
        {isActive && isPlaying ? (
          <span className="text-accent text-xs font-mono">▶</span>
        ) : (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {index !== undefined ? index + 1 : ""}
          </span>
        )}
      </div>

      {/* Artwork */}
      <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative">
        {track.artworkUrl ? (
          <Image
            src={track.artworkUrl}
            alt=""
            width={40}
            height={40}
            className="w-full h-full object-cover"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ backgroundColor: "var(--color-overlay)" }}
          />
        )}
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-fast flex items-center justify-center">
          <Play size={14} className="text-white ml-0.5" aria-hidden="true" />
        </div>
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{
            color: isActive
              ? "var(--color-accent)"
              : "var(--color-text-primary)",
          }}
        >
          {track.title}
        </p>
        <p
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span
        className="text-xs shrink-0 tabular-nums"
        style={{ color: "var(--color-text-muted)" }}
      >
        {formatDuration(track.duration)}
      </span>

      {/* Menu button */}
      {onMenuClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onMenuClick(track, e); }}
          className="opacity-0 group-hover:opacity-100 touch-target transition-fast rounded-lg text-muted hover:text-secondary"
          aria-label={`More options for ${track.title}`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
