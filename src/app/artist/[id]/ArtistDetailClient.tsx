"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, ListPlus, Mic2, Clock, Check } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly, getAudio } from "@/player/audio-engine";
import type { ArtistDetail, Track } from "@/types/music";

interface ArtistDetailClientProps {
  artist: ArtistDetail;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ArtistDetailClient({ artist }: ArtistDetailClientProps) {
  const router = useRouter();
  const [justAddedAll, setJustAddedAll] = useState(false);
  const { currentTrack, isPlaying, playNext, showQueueToast } = usePlayerStore();

  const isCurrentArtistActive =
    Boolean(currentTrack && artist.popularTracks.some((t) => t.id === currentTrack.id));

  const handlePlayAll = () => {
    if (!artist.popularTracks.length) return;

    if (isCurrentArtistActive && isPlaying) {
      const audio = getAudio();
      audio.pause();
      usePlayerStore.getState().pause();
      return;
    }

    // Play starting from first popular song with sequential queue
    playTrackDirectly(artist.popularTracks[0], {
      queue: artist.popularTracks,
      index: 0,
    });
    showQueueToast("Memutar lagu populer", artist.name);
  };

  const handlePlayTrack = (track: Track, index: number) => {
    // Play selected track with sequential artist popular queue
    playTrackDirectly(track, {
      queue: artist.popularTracks,
      index,
    });
  };

  const handleAddAllToQueue = () => {
    if (!artist.popularTracks.length) return;

    // Add all tracks to queue in order
    for (let i = artist.popularTracks.length - 1; i >= 0; i--) {
      playNext(artist.popularTracks[i]);
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }

    showQueueToast(
      `${artist.popularTracks.length} lagu populer dimasukkan ke antrean`,
      artist.name
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

      {/* Hero Artist Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8 p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-sky-500/15 via-white/[0.02] to-transparent border border-white/5">
        {/* Avatar Circle */}
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0 rounded-full overflow-hidden shadow-2xl bg-neutral-900 border-2 border-sky-400/40">
          {artist.artworkUrl ? (
            <Image
              src={artist.artworkUrl}
              alt={artist.name}
              width={180}
              height={180}
              className="w-full h-full object-cover"
              unoptimized
              priority
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5">
              <Mic2 size={48} className="text-white/20" />
            </div>
          )}
        </div>

        {/* Artist Meta */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Mic2 size={12} />
            <span>Artis</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-1.5">
            {artist.name}
          </h1>

          <p className="text-xs text-white/50 font-mono">
            {artist.popularTracks.length} Lagu Terpopuler
          </p>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent/90 text-white text-sm font-semibold shadow-lg shadow-sky-500/20 hover:scale-[1.02] active:scale-95 transition-all touch-manipulation cursor-pointer"
              aria-label="Putar Seluruh Lagu Populer"
            >
              {isCurrentArtistActive && isPlaying ? (
                <>
                  <Pause size={17} fill="currentColor" />
                  <span>Jeda</span>
                </>
              ) : (
                <>
                  <Play size={17} fill="currentColor" />
                  <span>Putar Populer</span>
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
              aria-label="Tambahkan seluruh lagu populer ke antrean"
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

      {/* Popular Tracks Section */}
      <section aria-labelledby="popular-tracks-heading" className="w-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">
          <div className="flex items-center gap-4">
            <span className="w-6 text-center">#</span>
            <h2 id="popular-tracks-heading" className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Lagu Terpopuler
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} />
          </div>
        </div>

        <div className="space-y-0.5">
          {artist.popularTracks.map((track, idx) => {
            const isActive = currentTrack?.id === track.id;

            return (
              <div
                key={`artist-track-${track.id}-${idx}`}
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

                {/* Artwork Thumbnail */}
                {track.artworkUrl && (
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-900 border border-white/5">
                    <Image
                      src={track.artworkUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

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
