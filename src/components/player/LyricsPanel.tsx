"use client";

import { useEffect, useState } from "react";
import { X, Mic2 } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import type { Lyrics } from "@/types/music";

interface LyricsPanelProps {
  onClose?: () => void;
}

export function LyricsPanel({ onClose }: LyricsPanelProps) {
  const { currentTrack, currentTime } = usePlayerStore();
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!currentTrack) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setLyrics(null);

    const params = new URLSearchParams({
      artist: currentTrack.artist,
      title: currentTrack.title,
      ...(currentTrack.duration ? { duration: String(Math.round(currentTrack.duration)) } : {}),
    });

    fetch(`/api/lyrics?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setLyrics(data.lyrics ?? null);
          setError(!data.lyrics);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // Find current lyric line
  const currentLineIndex = lyrics?.synced
    ? lyrics.synced.reduce((acc, line, i) => {
        return currentTime >= line.time ? i : acc;
      }, 0)
    : -1;

  return (
    <div className="flex flex-col h-full px-4 pt-4 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Lyrics
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="touch-target rounded-lg transition-fast text-muted hover:text-secondary"
            aria-label="Close lyrics"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading lyrics...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Mic2 size={28} style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Lyrics not available.
          </p>
        </div>
      )}

      {!loading && lyrics && (
        <div
          className="flex-1 overflow-y-auto space-y-3"
          aria-live="polite"
          aria-label="Lyrics"
        >
          {lyrics.synced ? (
            lyrics.synced.map((line, i) => (
              <p
                key={i}
                className={`text-base leading-relaxed transition-base ${
                  i === currentLineIndex
                    ? "text-primary font-semibold text-[17px]"
                    : "text-secondary"
                }`}
              >
                {line.text || "\u00A0"}
              </p>
            ))
          ) : (
            <pre
              className="text-sm leading-7 whitespace-pre-wrap font-sans"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {lyrics.plain}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
