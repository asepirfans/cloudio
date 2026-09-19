"use client";

import Image from "next/image";
import Link from "next/link";
import { Mic2, ChevronRight, Play } from "lucide-react";
import type { Artist } from "@/types/music";

interface ArtistCardProps {
  artist: Artist;
  featured?: boolean;
}

export function ArtistCard({ artist, featured }: ArtistCardProps) {
  const artistHref = `/artist/${encodeURIComponent(artist.id)}`;

  if (featured) {
    return (
      <Link
        href={artistHref}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-sky-500/15 via-white/[0.03] to-transparent border border-sky-500/25 shadow-lg group touch-manipulation select-none transition-all hover:border-sky-500/40 active:scale-[0.99] mb-5"
        aria-label={`Lihat profil dan koleksi lagu populer ${artist.name}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Avatar Circle */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0 bg-neutral-900 border-2 border-sky-500/40 shadow-md group-hover:border-sky-400 transition-colors">
            {artist.artworkUrl ? (
              <Image
                src={artist.artworkUrl}
                alt=""
                width={80}
                height={80}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/40">
                <Mic2 size={24} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-semibold tracking-wider uppercase mb-1">
              <span>Artis</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white truncate group-hover:text-sky-300 transition-colors">
              {artist.name}
            </h3>
            <p className="text-xs text-white/50 truncate">
              Koleksi Lagu Populer
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 group-hover:bg-accent group-hover:text-white text-white/80 text-xs font-semibold transition-all">
          <Play size={13} fill="currentColor" />
          <span className="hidden sm:inline">Buka Profil</span>
          <ChevronRight size={14} className="sm:hidden" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={artistHref}
      className="w-28 sm:w-32 shrink-0 group touch-manipulation select-none flex flex-col items-center text-center transition-transform active:scale-[0.98]"
      aria-label={`Lihat profil ${artist.name}`}
    >
      {/* Circular Avatar */}
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden mb-2 bg-neutral-900 border border-white/10 shadow-md group-hover:border-sky-400/60 transition-all">
        {artist.artworkUrl ? (
          <Image
            src={artist.artworkUrl}
            alt=""
            width={112}
            height={112}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/30">
            <Mic2 size={28} />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-xs sm:text-sm font-semibold truncate w-full group-hover:text-sky-400 transition-colors text-white">
        {artist.name}
      </p>
      <span className="text-[11px] text-white/40">Artis</span>
    </Link>
  );
}
