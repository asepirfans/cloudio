"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Pause,
  ListPlus,
  Share2,
  Check,
  MoreHorizontal,
  Clock,
  Disc,
} from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly, getAudio } from "@/player/audio-engine";
import { TrackActionsModal } from "@/components/track/TrackActionsModal";
import type { Track } from "@/types/music";

interface TrackDetailClientProps {
  track: Track;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackDetailClient({ track }: TrackDetailClientProps) {
  const router = useRouter();
  const [justAdded, setJustAdded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { currentTrack, isPlaying, playNext, showQueueToast } = usePlayerStore();

  const isCurrentActive = currentTrack?.id === track.id;

  const handlePlay = () => {
    if (isCurrentActive && isPlaying) {
      const audio = getAudio();
      audio.pause();
      usePlayerStore.getState().pause();
      return;
    }

    playTrackDirectly(track, {
      useSmartQueue: true,
    });
    showQueueToast("Memutar lagu", track.title);
  };

  const handleAddToQueue = () => {
    if (!currentTrack) {
      playTrackDirectly(track, { queue: [track], index: 0 });
      showQueueToast("Lagu mulai diputar", track.title);
    } else {
      playNext(track);
      showQueueToast("Ditambahkan ke antrean berikutnya", track.title);
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(35);
      } catch {}
    }

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const handleShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/track/${encodeURIComponent(track.id)}`;
    const shareText = `${track.title} oleh ${track.artist} di Cloudio`;

    let shared = false;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${track.title} - ${track.artist}`,
          text: shareText,
          url: shareUrl,
        });
        shared = true;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }

    if (!shared) {
      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        } catch {}
      }

      if (!copied && typeof document !== "undefined") {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = shareUrl;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.style.top = "0";
          textarea.setAttribute("readonly", "");
          document.body.appendChild(textarea);
          textarea.select();
          textarea.setSelectionRange(0, 99999);
          copied = document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch {}
      }

      showQueueToast("Tautan lagu disalin ke clipboard", track.title);
    }
  };

  return (
    <div className="min-h-screen pb-32 max-w-4xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
          } else {
            router.push("/");
          }
        }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-fast text-xs font-medium mb-6 cursor-pointer"
        aria-label="Kembali"
      >
        <ArrowLeft size={16} />
        <span>Kembali</span>
      </button>

      {/* Hero Track Card */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8 pb-8 border-b border-white/10">
        {/* Large Artwork */}
        <div className="w-52 h-52 sm:w-64 sm:h-64 rounded-2xl overflow-hidden shadow-2xl shrink-0 bg-white/5 relative border border-white/10">
          {track.artworkUrl ? (
            <Image
              src={track.artworkUrl}
              alt={`${track.title} cover`}
              width={256}
              height={256}
              priority
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <Disc size={64} />
            </div>
          )}
        </div>

        {/* Track Info & Actions */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2.5">
            <span>Trek Musik</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white mb-2 line-clamp-2">
            {track.title}
          </h1>

          <p className="text-base sm:text-lg text-white/80 font-medium mb-2">
            {track.artist}
          </p>

          <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-white/40">
            {track.album && <span className="truncate max-w-xs">{track.album}</span>}
            {track.duration ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                <span>{formatDuration(track.duration)}</span>
              </span>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-6">
            <button
              onClick={handlePlay}
              className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-sky-400 hover:bg-sky-400 text-black font-bold text-sm shadow-lg shadow-sky-500/20 hover:scale-[1.02] active:scale-95 transition-all touch-manipulation cursor-pointer"
              aria-label={isCurrentActive && isPlaying ? "Jeda lagu" : "Putar lagu"}
            >
              {isCurrentActive && isPlaying ? (
                <>
                  <Pause size={18} fill="currentColor" />
                  <span>Jeda</span>
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  <span>Putar Sekarang</span>
                </>
              )}
            </button>

            <button
              onClick={handleAddToQueue}
              className={`flex items-center gap-2 px-4 py-3 rounded-full border transition-all touch-manipulation cursor-pointer text-xs font-semibold active:scale-95 ${
                justAdded
                  ? "bg-sky-500/20 border-sky-500/40 text-sky-400"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
              }`}
              aria-label="Masukkan ke Antrean"
            >
              {justAdded ? (
                <>
                  <Check size={16} className="text-sky-400 stroke-[2.5]" />
                  <span>Masuk Antrean</span>
                </>
              ) : (
                <>
                  <ListPlus size={16} />
                  <span>Antrean</span>
                </>
              )}
            </button>

            <button
              onClick={handleShare}
              className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-fast cursor-pointer"
              aria-label="Bagikan lagu"
              title="Bagikan lagu"
            >
              <Share2 size={18} />
            </button>

            <button
              onClick={() => setShowMenu(true)}
              className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-fast cursor-pointer"
              aria-label="Opsi lainnya"
              title="Opsi lainnya"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Actions Modal */}
      <TrackActionsModal
        track={track}
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
      />
    </div>
  );
}
