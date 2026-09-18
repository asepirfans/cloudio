"use client";

import { X, Music2 } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import Image from "next/image";

interface QueuePanelProps {
  onClose?: () => void;
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { queue, currentIndex, currentTrack, setQueue, removeFromQueue, playNext } = usePlayerStore();

  const upNext = queue.slice(currentIndex + 1);

  return (
    <div className="flex flex-col h-full px-4 pt-4 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Queue
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="touch-target rounded-lg transition-fast text-muted hover:text-secondary"
            aria-label="Close queue"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Now Playing */}
      {currentTrack && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
            Now Playing
          </p>
          <QueueTrackItem
            track={currentTrack}
            isActive
          />
        </div>
      )}

      {/* Next up */}
      {upNext.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
            Next
          </p>
          <ul className="space-y-0.5">
            {upNext.map((track, i) => (
              <li key={`${track.id}-${i}`}>
                <QueueTrackItem
                  track={track}
                  onRemove={() => removeFromQueue(currentIndex + 1 + i)}
                  onClick={() => {
                    const newQueue = [track, ...queue.filter((_, qi) => qi !== currentIndex + 1 + i)];
                    setQueue(newQueue, 0);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {upNext.length === 0 && !currentTrack && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <Music2 size={32} style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Your queue is empty.
          </p>
        </div>
      )}
    </div>
  );
}

function QueueTrackItem({
  track,
  isActive = false,
  onRemove,
  onClick,
}: {
  track: { id: string; title: string; artist: string; artworkUrl?: string };
  isActive?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-2 py-2 rounded-lg group transition-fast ${
        isActive ? "" : "hover:bg-elevated cursor-pointer"
      }`}
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
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: isActive ? "var(--color-accent)" : "var(--color-text-primary)" }}
        >
          {track.title}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
          {track.artist}
        </p>
      </div>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 touch-target transition-fast text-muted hover:text-secondary"
          aria-label="Remove from queue"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
