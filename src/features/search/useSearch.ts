"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SearchResults } from "@/types/music";

const DEBOUNCE_MS = 300;

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ tracks: [], artists: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ tracks: [], artists: [], total: 0 });
      setLoading(false);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}`,
        { signal: abortRef.current.signal }
      );
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResults = await res.json();
      setResults(data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("Search failed. Please try again.");
      setResults({ tracks: [], artists: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      setResults({ tracks: [], artists: [], total: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      search(query);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  return { query, setQuery, results, loading, error };
}
