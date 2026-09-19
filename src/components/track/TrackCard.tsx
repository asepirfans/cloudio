"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, ListPlus, Check } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import type { Track } from "@/types/music";

interface TrackCardProps {
  track: Track;
  queue?: Track[];
}

export function TrackCard({ track, queue }: TrackCardProps) {
  const [justAdded, setJustAdded] = useState(false);
  const { currentTrack, isPlaying, playNext, showQueueToast } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (queue && queue.length > 0) {
      const idx = queue.findIndex((t) => t.id === track.id);
      playTrackDirectly(track, {
        queue,
        index: idx !== -1 ? idx : 0,
      });
    } else {
      playTrackDirectly(track, {
        useSmartQueue: true,
      });
    }
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) {
      playTrackDirectly(track, { queue: [track], index: 0 });
      showQueueToast("Lagu mulai diputar & antrean aktif", track.title);
    } else {
      playNext(track);
      showQueueToast("Ditambahkan ke antrean berikutnya", track.title);
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div
      className="w-36 shrink-0 cursor-pointer group touch-manipulation select-none active:scale-[0.98] transition-transform"
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
            loading="eager"
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

        {/* Quick Add to Queue button */}
        <button
          type="button"
          onClick={handleAddToQueue}
          className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full transition-all touch-manipulation cursor-pointer active:scale-90 ${
            justAdded
              ? "bg-sky-400 text-black shadow-md opacity-100"
              : "bg-black/60 text-white/90 hover:text-white hover:bg-black/80 backdrop-blur-md opacity-80 md:opacity-0 md:group-hover:opacity-100 border border-white/10"
          }`}
          title="Tambahkan ke antrean berikutnya"
          aria-label={`Tambahkan ${track.title} ke antrean`}
        >
          {justAdded ? (
            <>
              <Check size={13} className="text-black stroke-[2.5]" />
              <span className="text-[10px] font-semibold text-black">Antrean</span>
            </>
          ) : (
            <>
              <ListPlus size={14} />
              <span className="text-[10px] font-medium hidden md:inline">Antrean</span>
            </>
          )}
        </button>
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
