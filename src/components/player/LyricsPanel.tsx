"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X,
  Mic2,
  Languages,
  Loader2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Search,
} from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { SeekBar } from "./SeekBar";
import type { Lyrics, RepeatMode } from "@/types/music";

interface LyricsPanelProps {
  onClose?: () => void;
}

export function LyricsPanel({ onClose }: LyricsPanelProps) {
  const {
    currentTrack,
    currentTime,
    duration,
    isPlaying,
    isBuffering,
    shuffle,
    repeatMode,
    seek,
    next,
    previous,
    toggleShuffle,
    setRepeatMode,
  } = usePlayerStore();

  const handlePlayPause = () => {
    usePlayerStore.getState().togglePlay();
  };

  const nextRepeatMode = (current: RepeatMode): RepeatMode => {
    if (current === "off") return "queue";
    if (current === "queue") return "track";
    return "off";
  };

  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Auto-scroll controls
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Translation controls
  const [showTranslate, setShowTranslate] = useState(false);
  const [translatedLines, setTranslatedLines] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState<string | null>(null);

  // Manual search controls
  const [manualQuery, setManualQuery] = useState("");
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setLyrics(null);
    setIsUserScrolling(false);
    setTranslatedLines(null);
    setSourceLang(null);
    setManualQuery(`${currentTrack.title} ${currentTrack.artist}`);

    const videoId =
      currentTrack.providerTrackId ||
      (currentTrack.id.startsWith("ytm:") ? currentTrack.id.slice(4) : currentTrack.id);

    const params = new URLSearchParams({
      artist: currentTrack.artist,
      title: currentTrack.title,
      trackId: currentTrack.id,
      videoId: videoId,
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

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;

    setIsSearchingManual(true);
    setLoading(true);
    setError(false);

    try {
      const videoId =
        currentTrack?.providerTrackId ||
        (currentTrack?.id?.startsWith("ytm:") ? currentTrack.id.slice(4) : currentTrack?.id || "");

      const params = new URLSearchParams({
        title: manualQuery.trim(),
        trackId: currentTrack?.id || "",
        videoId: videoId,
      });

      const res = await fetch(`/api/lyrics?${params}`);
      const data = await res.json();
      if (data.lyrics) {
        setLyrics(data.lyrics);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setIsSearchingManual(false);
    }
  };

  // Handle translation fetching
  const fetchTranslation = useCallback(async (currentLyrics: Lyrics) => {
    let lines: string[] = [];
    if (currentLyrics.synced) {
      lines = currentLyrics.synced.map((l) => l.text);
    } else if (currentLyrics.plain) {
      lines = currentLyrics.plain.split("\n");
    }

    if (lines.length === 0) return;

    setIsTranslating(true);
    try {
      const res = await fetch("/api/lyrics/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, targetLang: "id" }),
      });

      if (res.ok) {
        const data = await res.json();
        setTranslatedLines(data.translated || []);
        setSourceLang(data.sourceLang || null);
      }
    } catch (err) {
      console.warn("[LyricsPanel] Translation request failed:", err);
    } finally {
      setIsTranslating(false);
    }
  }, []);

  // Auto-translate if user already enabled translate mode previously
  useEffect(() => {
    if (showTranslate && lyrics && !translatedLines && !isTranslating) {
      fetchTranslation(lyrics);
    }
  }, [showTranslate, lyrics, translatedLines, isTranslating, fetchTranslation]);

  const handleToggleTranslate = () => {
    const next = !showTranslate;
    setShowTranslate(next);
    if (next && lyrics && !translatedLines) {
      fetchTranslation(lyrics);
    }
  };

  // Find current active lyric line index
  const currentLineIndex = lyrics?.synced
    ? lyrics.synced.reduce((acc, line, i) => {
        return currentTime >= line.time ? i : acc;
      }, 0)
    : -1;

  // Scroll to active line
  const scrollToActiveLine = useCallback(() => {
    if (currentLineIndex < 0) return;
    const activeEl = lineRefs.current[currentLineIndex];
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex]);

  // Auto-scroll on current line change
  useEffect(() => {
    if (!autoScroll || isUserScrolling || currentLineIndex < 0) return;
    scrollToActiveLine();
  }, [currentLineIndex, autoScroll, isUserScrolling, scrollToActiveLine]);

  // Handle manual scroll by user
  const handleScroll = () => {
    if (!autoScroll) return;

    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    // Automatically re-engage auto-scroll after 4 seconds of idle
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 4000);
  };

  // Click on a line to jump/seek to that timestamp
  const handleLineClick = (lineTime: number) => {
    seek(lineTime);
    setIsUserScrolling(false);
    if (!autoScroll) {
      setAutoScroll(true);
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full max-w-full overflow-hidden bg-gradient-to-b from-[#141d26] via-[#0d131a] to-[#080b0e]">
      {/* Header bar (Desktop only — on mobile, FullPlayer header displays song title & artist) */}
      <div className="hidden md:flex items-center justify-between mb-2 shrink-0 px-4 pt-2 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Lirik
          </h2>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="touch-target p-1.5 rounded-lg transition-fast text-muted hover:text-secondary cursor-pointer"
            aria-label="Close lyrics"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="animate-spin text-sky-400" />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Memuat lirik lagu...
          </p>
        </div>
      )}

      {/* Error state with Manual Search */}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 max-w-sm mx-auto animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
            <Mic2 size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Lirik belum ditemukan otomatis
            </p>
            <p className="text-xs text-white/50 mt-1">
              Coba cari lirik secara manual dengan menyesuaikan kata kunci di bawah:
            </p>
          </div>

          <form onSubmit={handleManualSearch} className="w-full mt-2 flex gap-2">
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="e.g. Judul Lagu Artis"
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-sky-400 transition-fast"
            />
            <button
              type="submit"
              disabled={!manualQuery.trim() || isSearchingManual}
              className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-black font-semibold text-xs rounded-xl transition-fast shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              {isSearchingManual ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Search size={13} />
              )}
              <span>Cari</span>
            </button>
          </form>
        </div>
      )}

      {/* Lyrics Content */}
      {!loading && lyrics && (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 scroll-smooth scrollbar-hide px-5 sm:px-8 select-none"
          style={{
            paddingTop: "16vh",
            paddingBottom: "24vh",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Circular", "Inter", sans-serif',
            maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
          }}
          aria-live="polite"
          aria-label="Lyrics"
        >
          {lyrics.synced ? (
            lyrics.synced.map((line, i) => {
              const isCurrent = i === currentLineIndex;
              const isPast = i < currentLineIndex;
              const translation = showTranslate && translatedLines ? translatedLines[i] : null;

              return (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  onClick={() => handleLineClick(line.time)}
                  className="flex flex-col py-2.5 px-0 transition-all duration-300 cursor-pointer touch-manipulation"
                >
                  {/* Original line - Fluid Spotify typography */}
                  <p
                    className={`transition-all duration-300 tracking-tight leading-snug select-none ${
                      isCurrent
                        ? "text-white font-black text-2xl sm:text-3xl md:text-4xl opacity-100 scale-[1.02] origin-left drop-shadow-sm"
                        : isPast
                        ? "text-white/40 hover:text-white/70 font-extrabold text-xl sm:text-2xl md:text-3xl opacity-60"
                        : "text-white/25 hover:text-white/60 font-extrabold text-xl sm:text-2xl md:text-3xl opacity-40"
                    }`}
                  >
                    {line.text || "\u00A0"}
                  </p>

                  {/* Indonesian translated line - Grey before/after active, vibrant amber only when active */}
                  {translation && (
                    <p
                      className={`transition-all duration-300 leading-normal select-none ${
                        isCurrent
                          ? "text-amber-300 font-bold text-base sm:text-lg md:text-xl drop-shadow-sm mt-1 opacity-100"
                          : isPast
                          ? "text-white/40 font-medium text-sm sm:text-base mt-0.5 opacity-60"
                          : "text-white/25 font-medium text-sm sm:text-base mt-0.5 opacity-40"
                      }`}
                    >
                      {translation}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="pt-8 pb-16 space-y-5">
              {showTranslate && translatedLines ? (
                lyrics.plain?.split("\n").map((orig, idx) => (
                  <div key={idx} className="space-y-1 text-left">
                    <p className="text-xl sm:text-2xl text-white font-bold">{orig || "\u00A0"}</p>
                    {translatedLines[idx] && (
                      <p className="text-base sm:text-lg text-amber-300 font-medium">{translatedLines[idx]}</p>
                    )}
                  </div>
                ))
              ) : (
                <pre
                  className="text-xl sm:text-2xl leading-relaxed font-bold whitespace-pre-wrap font-sans text-left text-white/80"
                >
                  {lyrics.plain}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Music Player Bar (Sidebar Musik Bawah) */}
      <div
        className="w-full shrink-0 bg-gradient-to-t from-black via-black/90 to-transparent px-4 pt-3 pb-4 transition-all z-20"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {/* Actions row above Seek Bar */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          {/* Crisp, Round Translation Toggle Button */}
          {lyrics ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleToggleTranslate}
                disabled={isTranslating}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className={`w-9 h-9 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none ${
                  showTranslate
                    ? "bg-amber-400 text-neutral-950 shadow-md shadow-amber-400/25 font-bold"
                    : "bg-white/10 text-white border border-white/15 hover:bg-white/15"
                }`}
                title={showTranslate ? "Matikan terjemahan" : "Terjemahkan ke Bahasa Indonesia"}
                aria-label="Terjemahkan lirik ke bahasa Indonesia"
              >
                {isTranslating ? (
                  <Loader2
                    size={16}
                    className={`animate-spin shrink-0 ${showTranslate ? "text-neutral-950" : "text-white"}`}
                  />
                ) : (
                  <Languages
                    size={17}
                    strokeWidth={2.4}
                    className={`shrink-0 ${showTranslate ? "text-neutral-950" : "text-white"}`}
                  />
                )}
              </button>
            </div>
          ) : (
            <div />
          )}

          {lyrics?.source && (
            <span className="text-[10px] text-white/40 tracking-tight font-medium select-none truncate max-w-[200px]">
              {lyrics.source}
            </span>
          )}
        </div>

        {/* Spotify-style Seek Bar */}
        <div className="w-full mb-3">
          <SeekBar spotifyStyle showRemaining />
        </div>

        {/* Main Playback Row: Shuffle, Previous, Big White Circular Play/Pause, Next, Repeat */}
        <div className="flex items-center justify-between px-2 sm:px-6">
          <button
            onClick={toggleShuffle}
            className={`p-2 rounded-full transition-colors active:scale-90 cursor-pointer ${
              shuffle ? "text-accent" : "text-white/40 hover:text-white"
            }`}
            aria-label="Acak antrean"
          >
            <Shuffle size={18} />
          </button>

          <div className="flex items-center gap-6">
            <button
              onClick={previous}
              className="p-2 rounded-full text-white/70 hover:text-white active:scale-90 transition-transform cursor-pointer"
              aria-label="Lagu sebelumnya"
            >
              <SkipBack size={22} strokeWidth={2} />
            </button>

            {/* Big White Circular Button Matching Spotify Screenshot */}
            <button
              onClick={handlePlayPause}
              style={{ width: "56px", height: "56px", minWidth: "56px", minHeight: "56px" }}
              className="rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label={(isPlaying || isBuffering) ? "Jeda lagu" : "Putar lagu"}
            >
              {(isPlaying || isBuffering) ? (
                <Pause size={24} className="fill-black text-black" strokeWidth={0} />
              ) : (
                <Play size={24} className="fill-black text-black ml-1" strokeWidth={0} />
              )}
            </button>

            <button
              onClick={next}
              className="p-2 rounded-full text-white/70 hover:text-white active:scale-90 transition-transform cursor-pointer"
              aria-label="Lagu berikutnya"
            >
              <SkipForward size={22} strokeWidth={2} />
            </button>
          </div>

          <button
            onClick={() => setRepeatMode(nextRepeatMode(repeatMode))}
            className={`p-2 rounded-full transition-colors active:scale-90 cursor-pointer ${
              repeatMode !== "off" ? "text-accent" : "text-white/40 hover:text-white"
            }`}
            aria-label="Ulangi lagu"
          >
            {repeatMode === "track" ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
