"use client";

import { X, Music2, ListMusic, History } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import Image from "next/image";

interface QueuePanelProps {
  onClose?: () => void;
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { queue, currentIndex, currentTrack, priorityQueueCount, removeFromQueue, clearQueue } = usePlayerStore();

  const previousTracks = queue.slice(0, currentIndex);
  const upNext = queue.slice(currentIndex + 1);

  return (
    <div className="flex flex-col h-full w-full max-w-full px-3 sm:px-4 pt-2 pb-8 overflow-y-auto overflow-x-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0 w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <ListMusic size={18} className="text-accent shrink-0" aria-hidden="true" />
          <h2 className="text-base font-bold text-white whitespace-nowrap">
            Antrean Putar <span className="text-white/40 text-xs font-normal font-mono">({queue.length})</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {queue.length > 1 && (
            <button
              onClick={clearQueue}
              className="text-xs px-2.5 py-1 rounded-full transition-fast text-white/60 hover:text-white hover:bg-white/10 border border-white/10 active:scale-95 cursor-pointer touch-manipulation whitespace-nowrap"
            >
              Kosongkan
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="hidden md:flex touch-target p-1 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer"
              aria-label="Tutup antrean"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Previously Played (History) */}
      {previousTracks.length > 0 && (
        <div className="mb-4 w-full min-w-0">
          <div className="flex items-center gap-1.5 mb-2">
            <History size={13} className="text-muted shrink-0" aria-hidden="true" />
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--color-text-muted)" }}>
              Sebelumnya ({previousTracks.length})
            </p>
          </div>
          <ul className="space-y-0.5 opacity-60 hover:opacity-100 transition-opacity w-full">
            {previousTracks.map((track, i) => (
              <li key={`prev-${track.id}-${i}`} className="w-full min-w-0">
                <QueueTrackItem
                  track={track}
                  onClick={() => {
                    playTrackDirectly(track, { queue, index: i });
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Now Playing */}
      {currentTrack && (
        <div className="mb-4 w-full min-w-0">
          <p className="text-xs uppercase tracking-wider mb-2 font-semibold text-accent">
            Sedang Diputar
          </p>
          <QueueTrackItem
            track={currentTrack}
            isActive
          />
        </div>
      )}

      {/* Next up */}
      {upNext.length > 0 && (
        <div className="w-full min-w-0">
          <p className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: "var(--color-text-muted)" }}>
            Berikutnya ({upNext.length})
          </p>
          <ul className="space-y-0.5 w-full">
            {upNext.map((track, i) => {
              const targetIndex = currentIndex + 1 + i;
              const isPriority = i < (priorityQueueCount || 0);
              return (
                <li key={`next-${track.id}-${targetIndex}`} className="w-full min-w-0">
                  <QueueTrackItem
                    track={track}
                    isPriority={isPriority}
                    onRemove={() => removeFromQueue(targetIndex)}
                    onClick={() => {
                      playTrackDirectly(track, { queue, index: targetIndex });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}


      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center gap-3">
          <Music2 size={32} style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Antrean kamu kosong.
          </p>
        </div>
      )}
    </div>
  );
}

function QueueTrackItem({
  track,
  isActive = false,
  isPriority = false,
  onRemove,
  onClick,
}: {
  track: { id: string; title: string; artist: string; artworkUrl?: string };
  isActive?: boolean;
  isPriority?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 sm:gap-3 px-2 py-2 rounded-lg group transition-fast w-full max-w-full overflow-hidden ${
        isActive ? "" : "hover:bg-elevated cursor-pointer"
      } ${isPriority ? "bg-sky-500/[0.06] border border-sky-500/20" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="w-9 h-9 rounded-md overflow-hidden shrink-0">
        {track.artworkUrl ? (
          <Image
            src={track.artworkUrl}
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: "var(--color-overlay)" }} />
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 w-full min-w-0">
          <p
            className="text-sm font-medium truncate flex-1 min-w-0"
            style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-primary)" }}
          >
            {track.title}
          </p>
          {isPriority && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-medium border border-sky-500/30 shrink-0 whitespace-nowrap">
              Pilihan Kamu
            </span>
          )}
        </div>
        <p className="text-xs truncate w-full" style={{ color: "var(--color-text-muted)" }}>
          {track.artist}
        </p>
      </div>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer touch-manipulation shrink-0 opacity-80 md:opacity-0 md:group-hover:opacity-100"
          aria-label="Hapus dari antrean"
          title="Hapus dari antrean"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
