"use client";

import { useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useSearch } from "@/features/search/useSearch";
import { TrackRow } from "@/components/track/TrackRow";

export function SearchClient() {
  const { query, setQuery, results, loading, error } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasResults = results.tracks.length > 0 || results.artists.length > 0;
  const isEmpty = query.trim().length > 0 && !loading && !hasResults && !error;

  return (
    <div className="px-4 pt-4 pb-2 max-w-2xl mx-auto">
      <h1
        className="text-2xl font-semibold tracking-tight mb-4"
        style={{ color: "var(--color-text-primary)" }}
      >
        Search
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
          placeholder="Search songs, artists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full py-3 pl-10 pr-10 bg-transparent text-sm outline-none"
          style={{ color: "var(--color-text-primary)" }}
          aria-label="Search music"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="absolute right-3 touch-target rounded-lg transition-fast"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Clear search"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12" aria-live="polite" aria-label="Searching...">
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
          No results for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <div aria-live="polite">
          {results.tracks.length > 0 && (
            <section aria-labelledby="tracks-heading">
              <h2
                id="tracks-heading"
                className="text-xs uppercase tracking-wider mb-2 px-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                Songs
              </h2>
              <div className="space-y-0.5 mb-6">
                {results.tracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    useSmartQueue
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Default state — no query */}
      {!query && (
        <div
          className="text-center py-16 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Search songs, artists, and more.
        </div>
      )}
    </div>
  );
}
