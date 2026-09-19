"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, MoreHorizontal, ListPlus, Check, Download } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { TrackActionsModal } from "./TrackActionsModal";
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
  const [justAdded, setJustAdded] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const { currentTrack, isPlaying, playNext, showQueueToast } = usePlayerStore();
  const { checkIsOffline } = useOfflineStorage();
  const isOffline = checkIsOffline(track.id);
  const isActive = currentTrack?.id === track.id;
  const isUnavailable = track.availability === "UNAVAILABLE";

  const handlePlay = (e?: React.MouseEvent) => {
    if (isUnavailable) return;
    e?.stopPropagation();
    if (queue && queue.length > 0) {
      const idx = index !== undefined && index >= 0 ? index : queue.findIndex((t) => t.id === track.id);
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
    if (isUnavailable) return;

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
      className={`w-full max-w-full flex items-center gap-3 px-3 py-2 rounded-lg group transition-fast cursor-pointer touch-manipulation select-none active:scale-[0.99] ${
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
          className="text-xs truncate mt-0.5 flex items-center gap-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {isOffline && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 shrink-0"
              title="Tersimpan di Bucket Offline"
            >
              <Download size={9} strokeWidth={2.5} />
              <span>Offline</span>
            </span>
          )}
          <span className="truncate">{track.artist}</span>
        </p>
      </div>

      {/* Add to Queue button with clear affordance */}
      <button
        type="button"
        onClick={handleAddToQueue}
        disabled={isUnavailable}
        className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all touch-manipulation cursor-pointer active:scale-95 ${
          justAdded
            ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
            : "text-white/45 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10"
        }`}
        aria-label={`Tambahkan ${track.title} ke antrean`}
        title={`Tambahkan ke antrean berikutnya ${track.duration ? `(${formatDuration(track.duration)})` : ""}`}
      >
        {justAdded ? (
          <>
            <Check size={15} className="text-sky-400 stroke-[2.5]" />
            <span className="text-[11px] font-medium text-sky-400">Masuk Antrean</span>
          </>
        ) : (
          <>
            <ListPlus size={16} strokeWidth={2} />
            <span className="text-[11px] font-medium hidden md:inline">Antrean</span>
          </>
        )}
      </button>

      {/* Menu button: accessible on mobile and desktop */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onMenuClick) {
            onMenuClick(track, e);
          } else {
            setShowActionsModal(true);
          }
        }}
        className="opacity-70 sm:opacity-0 group-hover:opacity-100 p-1.5 sm:p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-fast shrink-0 cursor-pointer"
        aria-label={`Menu opsi untuk ${track.title}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {/* Action modal for options like playlist & offline */}
      <TrackActionsModal
        track={track}
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
      />
    </div>
  );
}
