"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Search, X, Loader2, Clock, Trash2 } from "lucide-react";
import { useSearch } from "@/features/search/useSearch";
import { TrackRow } from "@/components/track/TrackRow";
import { ArtistCard } from "@/components/artist/ArtistCard";
import { AlbumCard } from "@/components/album/AlbumCard";

const SEARCH_HISTORY_KEY = "cloudbeats_search_history";
const MAX_HISTORY_ITEMS = 8;

export function SearchClient() {
  const { query, setQuery, results, loading, error } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {}
  }, []);

  const saveToHistory = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((term: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((item) => item !== term);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearAllHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {}
  }, []);

  const handleSelectHistoryItem = (term: string) => {
    setQuery(term);
    saveToHistory(term);
    inputRef.current?.focus();
  };

  const hasArtists = Boolean(results.artists && results.artists.length > 0);
  const hasTracks = Boolean(results.tracks && results.tracks.length > 0);
  const hasAlbums = Boolean(results.albums && results.albums.length > 0);
  const hasResults = hasTracks || hasArtists || hasAlbums;
  const isEmpty = query.trim().length > 0 && !loading && !hasResults && !error;

  const isArtistDirectMatch = Boolean(results.isArtistMatch && hasArtists);

  useEffect(() => {
    if (hasResults && query.trim().length >= 2) {
      const timer = setTimeout(() => {
        saveToHistory(query);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasResults, query, saveToHistory]);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6 pb-2 overflow-x-hidden">
      <h1
        className="text-2xl font-semibold tracking-tight mb-4"
        style={{ color: "var(--color-text-primary)" }}
      >
        Pencarian
      </h1>

      {/* Search input */}
      <div
        className="relative flex items-center rounded-xl border mb-6"
        style={{
          backgroundColor: "var(--color-elevated)",
          borderColor: "var(--color-border)",
        }}
      >
        <Search
          size={18}
          className="absolute left-3 shrink-0"
          style={{ color: "var(--color-text-muted)" }}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          placeholder="Cari lagu, artis, lirik..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              saveToHistory(query);
            }
          }}
          className="w-full py-3 pl-10 pr-10 bg-transparent text-sm outline-none"
          style={{ color: "var(--color-text-primary)" }}
          aria-label="Cari musik"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-3 touch-target rounded-lg transition-fast"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Hapus pencarian"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12" aria-live="polite" aria-label="Mencari...">
          <Loader2
            size={22}
            className="animate-spin"
            style={{ color: "var(--color-text-muted)" }}
          />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--color-error)" }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--color-text-muted)" }}
          aria-live="polite"
        >
          Tidak ada hasil untuk &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <div aria-live="polite">
          {/* Skenario A: Jika mencari nama artis -> Folder/Profil artis ada di PALING DEPAN */}
          {isArtistDirectMatch && hasArtists && (
            <section aria-labelledby="featured-artist-heading" className="mb-6">
              <h2
                id="featured-artist-heading"
                className="text-xs uppercase tracking-wider font-semibold mb-2.5 px-1 text-white/40"
              >
                Profil Artis
              </h2>
              <ArtistCard artist={results.artists[0]} featured />
            </section>
          )}

          {/* Skenario B & Fallback: Daftar Lagu */}
          {hasTracks && (
            <section aria-labelledby="tracks-heading" className="mb-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2
                  id="tracks-heading"
                  className="text-xs uppercase tracking-wider font-semibold text-white/40"
                >
                  Lagu
                </h2>
                <span className="text-xs text-white/40 font-mono">
                  {results.tracks.length} lagu
                </span>
              </div>
              <div className="space-y-0.5">
                {results.tracks.map((track, i) => (
                  <TrackRow
                    key={`${track.id}-${i}`}
                    track={track}
                    index={i}
                    useSmartQueue
                  />
                ))}
              </div>
            </section>
          )}

          {/* Artis Terkait (Jika mencari lirik/judul lagu, ditaruh di bawah lagu, BUKAN di paling depan) */}
          {!isArtistDirectMatch && hasArtists && (
            <section aria-labelledby="related-artists-heading" className="mb-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2
                  id="related-artists-heading"
                  className="text-xs uppercase tracking-wider font-semibold text-white/40"
                >
                  Artis Terkait
                </h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
                {results.artists.slice(0, 5).map((artist, i) => (
                  <ArtistCard key={`search-artist-${artist.id}-${i}`} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {/* Album (Sebagai koleksi pelengkap di bagian bawah) */}
          {hasAlbums && results.albums && (
            <section aria-labelledby="albums-heading" className="mb-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2
                  id="albums-heading"
                  className="text-xs uppercase tracking-wider font-semibold text-white/40"
                >
                  Album
                </h2>
                <span className="text-xs text-white/40 font-mono">
                  {results.albums.length} album
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
                {results.albums.map((album, i) => (
                  <AlbumCard key={`search-album-${album.id}-${i}`} album={album} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Search History section */}
      {!query && history.length > 0 && (
        <section aria-labelledby="search-history-heading" className="py-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-white/40" />
              <h2
                id="search-history-heading"
                className="text-xs font-semibold uppercase tracking-wider text-white/50"
              >
                Pencarian Terakhir
              </h2>
            </div>
            <button
              onClick={clearAllHistory}
              className="text-xs text-white/40 hover:text-red-400 transition-fast flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-white/5"
            >
              <Trash2 size={13} />
              <span>Hapus Semua</span>
            </button>
          </div>

          <div className="space-y-1">
            {history.map((term, i) => (
              <div
                key={`hist-${term}-${i}`}
                onClick={() => handleSelectHistoryItem(term)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-fast cursor-pointer group select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Clock size={15} className="text-white/40 group-hover:text-sky-400 transition-fast shrink-0" />
                  <span className="text-sm text-white/80 group-hover:text-white truncate font-normal">
                    {term}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => removeFromHistory(term, e)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-fast shrink-0 opacity-70 group-hover:opacity-100"
                  aria-label={`Hapus ${term} dari riwayat`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Default state — no query & no history */}
      {!query && history.length === 0 && (
        <div
          className="text-center py-16 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Cari lagu, artis, album, dan lirik favoritmu.
        </div>
      )}
    </div>
  );
}
