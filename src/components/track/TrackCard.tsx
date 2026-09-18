"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

interface TrackCardProps {
  track: Track;
  queue?: Track[];
}

export function TrackCard({ track, queue }: TrackCardProps) {
  const { setQueue, play, currentTrack, isPlaying, queue: storeQueue } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = () => {
    if (isActive) {
      usePlayerStore.getState().togglePlay();
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
      className="w-36 shrink-0 cursor-pointer group"
      role="button"
      onClick={handlePlay}
      aria-label={`Play ${track.title} by ${track.artist}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handlePlay()}
    >
      {/* Artwork */}
      <div
        className="relative w-36 h-36 rounded-lg overflow-hidden mb-2"
        style={{ borderRadius: "var(--radius-artwork)" }}
      >
        {track.artworkUrl ? (
          <Image
            src={track.artworkUrl}
            alt=""
            width={144}
            height={144}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ backgroundColor: "var(--color-elevated)" }}
          />
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-fast flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--color-text-primary)" }}
          >
            {isActive && isPlaying ? (
              <span className="w-3 h-3 flex gap-0.5 items-center">
                <span className="w-1 h-3 bg-black rounded-sm" />
                <span className="w-1 h-3 bg-black rounded-sm" />
              </span>
            ) : (
              <Play size={16} className="ml-0.5 text-black" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Active indicator */}
        {isActive && (
          <div
            className="absolute bottom-2 left-2 text-xs font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
            }}
          >
            Playing
          </div>
        )}
      </div>

      {/* Track info */}
      <p
        className="text-sm font-medium truncate"
        style={{ color: "var(--color-text-primary)" }}
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
  );
}
