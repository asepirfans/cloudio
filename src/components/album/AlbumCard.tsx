"use client";

import Image from "next/image";
import Link from "next/link";
import { Disc } from "lucide-react";
import type { Album } from "@/types/music";

interface AlbumCardProps {
  album: Album;
}

export function AlbumCard({ album }: AlbumCardProps) {
  const albumHref = `/album/${encodeURIComponent(album.id)}`;

  return (
    <Link
      href={albumHref}
      className="w-36 sm:w-40 shrink-0 group touch-manipulation select-none block transition-transform active:scale-[0.98]"
      aria-label={`Lihat album ${album.title} oleh ${album.artist}`}
    >
      {/* Artwork Container */}
      <div
        className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-xl overflow-hidden mb-2.5 bg-neutral-900 border border-white/5 shadow-md group-hover:border-white/20 transition-all"
        style={{ borderRadius: "var(--radius-artwork)" }}
      >
        {album.artworkUrl ? (
          <Image
            src={album.artworkUrl}
            alt=""
            width={160}
            height={160}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: "var(--color-overlay)" }}
          >
            <Disc size={32} className="text-white/30" />
          </div>
        )}

        {/* Album Badge Pill */}
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[10px] font-medium text-white/90">
          <Disc size={10} className="text-sky-400" />
          <span>Album</span>
        </div>

        {/* Gradient shadow overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5" />
      </div>

      {/* Info */}
      <div className="w-full min-w-0">
        <p
          className="text-sm font-semibold truncate group-hover:text-accent transition-colors"
          style={{ color: "var(--color-text-primary)" }}
        >
          {album.title}
        </p>
        <p
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {album.artist}
        </p>
        {album.year && (
          <p
            className="text-[11px] truncate mt-0.5 font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {album.year}
          </p>
        )}
      </div>
    </Link>
  );
}
