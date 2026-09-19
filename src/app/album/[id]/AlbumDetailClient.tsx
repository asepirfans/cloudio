"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, ListPlus, Disc, Clock, Check } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly, getAudio } from "@/player/audio-engine";
import type { AlbumDetail, Track } from "@/types/music";

interface AlbumDetailClientProps {
  album: AlbumDetail;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function calculateTotalDuration(tracks: Track[]): string {
  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  if (!totalSeconds) return "";
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes} menit`;
}

export function AlbumDetailClient({ album }: AlbumDetailClientProps) {
  const router = useRouter();
  const [justAddedAll, setJustAddedAll] = useState(false);
  const { currentTrack, isPlaying, playNext, showQueueToast } = usePlayerStore();

  const isCurrentAlbumActive =
    Boolean(currentTrack && album.tracks.some((t) => t.id === currentTrack.id));

  const handlePlayAll = () => {
    if (!album.tracks.length) return;

    if (isCurrentAlbumActive && isPlaying) {
      const audio = getAudio();
      audio.pause();
      usePlayerStore.getState().pause();
      return;
    }

    // Play starting from first track and set entire album as sequential queue
    playTrackDirectly(album.tracks[0], {
      queue: album.tracks,
      index: 0,
    });
    showQueueToast("Memutar album", album.title);
  };

  const handlePlayTrack = (track: Track, index: number) => {
    // Play selected track with sequential album queue
    playTrackDirectly(track, {
      queue: album.tracks,
      index,
    });
  };

  const handleAddAllToQueue = () => {
    if (!album.tracks.length) return;

    // Add all tracks from album to queue
    for (let i = album.tracks.length - 1; i >= 0; i--) {
      playNext(album.tracks[i]);
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }

    showQueueToast(
      `${album.tracks.length} lagu dimasukkan ke antrean`,
      album.title
    );

    setJustAddedAll(true);
    setTimeout(() => setJustAddedAll(false), 2000);
  };

  const handleAddSingleTrack = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!currentTrack) {
      playTrackDirectly(track, { queue: [track], index: 0 });
      showQueueToast("Lagu mulai diputar", track.title);
    } else {
      playNext(track);
      showQueueToast("Ditambahkan ke antrean berikutnya", track.title);
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }
  };

  const totalDurationText = calculateTotalDuration(album.tracks);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6 pb-28 overflow-x-hidden">
      {/* Top Navigation */}
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 transition-colors touch-manipulation cursor-pointer active:scale-95"
          aria-label="Kembali"
        >
          <ArrowLeft size={16} />
          <span>Kembali</span>
        </button>
      </div>

      {/* Hero Album Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8 p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-sky-500/10 via-white/[0.02] to-transparent border border-white/5">
        {/* Artwork */}
        <div className="relative w-44 h-44 sm:w-48 sm:h-48 shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-white/10">
          {album.artworkUrl ? (
            <Image
              src={album.artworkUrl}
              alt={album.title}
              width={200}
              height={200}
              className="w-full h-full object-cover"
              unoptimized
              priority
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5">
              <Disc size={48} className="text-white/20" />
            </div>
          )}
        </div>

        {/* Album Meta */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-medium mb-2">
            <Disc size={13} />
            <span>ALBUM</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white line-clamp-2 mb-1.5">
            {album.title}
          </h1>

          <p className="text-base font-semibold text-white/90 mb-2">
            {album.artist}
          </p>

          <p className="text-xs text-white/50 font-mono">
            {album.year ? `${album.year} • ` : ""}
            {album.tracks.length} lagu
            {totalDurationText ? ` • ${totalDurationText}` : ""}
          </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent/90 text-white text-sm font-semibold shadow-lg shadow-sky-500/20 hover:scale-[1.02] active:scale-95 transition-all touch-manipulation cursor-pointer"
              aria-label="Putar Seluruh Album"
            >
              {isCurrentAlbumActive && isPlaying ? (
                <>
                  <Pause size={17} fill="currentColor" />
                  <span>Jeda</span>
                </>
              ) : (
                <>
                  <Play size={17} fill="currentColor" />
                  <span>Putar Album</span>
                </>
              )}
            </button>

            <button
              onClick={handleAddAllToQueue}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-medium transition-all touch-manipulation cursor-pointer active:scale-95 ${
                justAddedAll
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                  : "bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/10"
              }`}
              aria-label="Tambahkan seluruh album ke antrean"
            >
              {justAddedAll ? (
                <>
                  <Check size={16} className="text-sky-400 stroke-[2.5]" />
                  <span>Semua Masuk Antrean</span>
                </>
              ) : (
                <>
                  <ListPlus size={16} />
                  <span>Tambah Semua</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tracks Section */}
      <section aria-labelledby="album-tracks-heading" className="w-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">
          <div className="flex items-center gap-4">
            <span className="w-6 text-center">#</span>
            <span>Judul</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} />
          </div>
        </div>

        <div className="space-y-0.5">
          {album.tracks.map((track, idx) => {
            const isActive = currentTrack?.id === track.id;

            return (
              <div
                key={`album-track-${track.id}-${idx}`}
                onClick={() => handlePlayTrack(track, idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handlePlayTrack(track, idx)}
                className={`w-full max-w-full flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-colors cursor-pointer select-none touch-manipulation active:scale-[0.99] ${
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                }`}
                aria-label={`Putar lagu ${track.title}`}
              >
                {/* Track Number / Active indicator */}
                <div className="w-6 text-center shrink-0">
                  {isActive && isPlaying ? (
                    <span className="text-accent text-xs font-mono">▶</span>
                  ) : (
                    <span
                      className="text-xs group-hover:hidden"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {idx + 1}
                    </span>
                  )}
                  <span className="hidden group-hover:inline-block text-white text-xs">
                    <Play size={12} fill="currentColor" />
                  </span>
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isActive ? "text-accent font-semibold" : "text-white"
                    }`}
                  >
                    {track.title}
                  </p>
                  <p className="text-xs text-white/50 truncate mt-0.5">
                    {track.artist}
                  </p>
                </div>

                {/* Add to queue action */}
                <button
                  type="button"
                  onClick={(e) => handleAddSingleTrack(track, e)}
                  className="shrink-0 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 active:scale-95 transition-all touch-manipulation cursor-pointer"
                  title="Tambahkan ke antrean berikutnya"
                  aria-label={`Tambahkan ${track.title} ke antrean`}
                >
                  <ListPlus size={16} />
                </button>

                {/* Duration */}
                {track.duration ? (
                  <span className="text-xs text-white/40 font-mono shrink-0 w-10 text-right">
                    {formatDuration(track.duration)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
