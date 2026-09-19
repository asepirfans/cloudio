"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { TrackCard } from "@/components/track/TrackCard";
import { TrackRow } from "@/components/track/TrackRow";
import { AiDjCard } from "@/components/vibe/AiDjCard";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

interface HomeSections {
  indonesianHits: Track[];
  globalHits: Track[];
  chillHits: Track[];
}

interface HomeClientProps {
  sections: HomeSections;
}

type CategoryTab = "all" | "indonesia" | "global" | "chill";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export function HomeClient({ sections }: HomeClientProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [generatedVibe, setGeneratedVibe] = useState<{ name: string; tracks: Track[] } | null>(null);
  const { queue: recentQueue, currentTrack } = usePlayerStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
    const updateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const indonesianHits = sections.indonesianHits || [];
  const globalHits = sections.globalHits || [];
  const chillHits = sections.chillHits || [];

  const recentlyPlayed = mounted && currentTrack
    ? [currentTrack, ...recentQueue.filter((t) => t.id !== currentTrack.id)].slice(0, 8)
    : mounted
    ? recentQueue.slice(0, 8)
    : [];

  const tabs: { id: CategoryTab; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "indonesia", label: "Indonesia" },
    { id: "global", label: "Internasional" },
    { id: "chill", label: "Akustik" },
  ];

  return (
    <div className="px-4 pt-0 md:pt-6 pb-6 max-w-4xl mx-auto w-full max-w-full">
      {/* Fixed Header on Mobile (Logo -> Greeting -> Categories) */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/[0.08] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:static md:bg-transparent md:backdrop-blur-none md:border-b-0 md:p-0 md:m-0 md:mb-6"
      >
        <div className="max-w-4xl mx-auto w-full">
          {/* Mobile Brand Logo Header */}
          <div className="flex items-center justify-between pb-2.5 md:hidden">
            <Link href="/" className="inline-flex items-center" aria-label="Cloudio home">
              <Image
                src="/logo-horizontal.png"
                alt="Cloudio"
                width={125}
                height={28}
                className="h-6 w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* Greeting & Header */}
          <div className="mb-2.5">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
              suppressHydrationWarning
            >
              {getGreeting()}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Lagu dan daftar putar terpopuler hari ini
            </p>
          </div>

          {/* Category Pills Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? "bg-white text-black shadow-sm font-semibold scale-[1.02]"
                      : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spacer for Mobile Fixed Header */}
      <div
        className="md:hidden"
        style={{ height: headerHeight > 0 ? `${headerHeight + 12}px` : "155px" }}
        aria-hidden="true"
      />

      {/* AI DJ Curator Card */}
      {activeTab === "all" && (
        <AiDjCard
          onDjCurated={(name, tracks) => setGeneratedVibe({ name, tracks })}
        />
      )}

      {/* Active Generated Vibe Section */}
      {generatedVibe && generatedVibe.tracks.length > 0 && (
        <section className="mb-8 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2
                className="text-[15px] font-semibold tracking-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                Sesi DJ: {generatedVibe.name}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {generatedVibe.tracks.length} lagu pilihan terkurasi
              </p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {generatedVibe.tracks.map((track, i) => (
              <TrackCard key={`vibe-${track.id}-${i}`} track={track} queue={generatedVibe.tracks} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Played (Only shown on "Semua" or if tracks exist) */}
      {activeTab === "all" && recentlyPlayed.length > 0 && (
        <section className="mb-8" aria-labelledby="recently-played-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="recently-played-heading"
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              Baru Saja Diputar
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {recentlyPlayed.map((track, i) => (
              <TrackCard key={`recent-${track.id}-${i}`} track={track} queue={recentlyPlayed} />
            ))}
          </div>
        </section>
      )}

      {/* Indonesian Hits Section */}
      {(activeTab === "all" || activeTab === "indonesia") && indonesianHits.length > 0 && (
        <section className="mb-8" aria-labelledby="indonesia-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="indonesia-heading"
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              Hits Indonesia
            </h2>
          </div>
          {activeTab === "indonesia" ? (
            <div className="space-y-0.5">
              {indonesianHits.map((track, i) => (
                <TrackRow
                  key={`indo-row-${track.id}-${i}`}
                  track={track}
                  index={i}
                  queue={indonesianHits}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {indonesianHits.slice(0, 10).map((track, i) => (
                <TrackCard key={`indo-card-${track.id}-${i}`} track={track} queue={indonesianHits} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Global & Western Hits Section */}
      {(activeTab === "all" || activeTab === "global") && globalHits.length > 0 && (
        <section className="mb-8" aria-labelledby="global-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="global-heading"
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              Hits Internasional
            </h2>
          </div>
          <div className="space-y-0.5">
            {(activeTab === "global" ? globalHits : globalHits.slice(0, 6)).map((track, i) => {
              const currentList = activeTab === "global" ? globalHits : globalHits.slice(0, 6);
              return (
                <TrackRow
                  key={`global-row-${track.id}-${i}`}
                  track={track}
                  index={i}
                  queue={currentList}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Chill & Acoustic Section */}
      {(activeTab === "all" || activeTab === "chill") && chillHits.length > 0 && (
        <section className="mb-8" aria-labelledby="chill-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="chill-heading"
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              Akustik Pilihan
            </h2>
          </div>
          {activeTab === "chill" ? (
            <div className="space-y-0.5">
              {chillHits.map((track, i) => (
                <TrackRow
                  key={`chill-row-${track.id}-${i}`}
                  track={track}
                  index={i}
                  queue={chillHits}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {chillHits.slice(0, 10).map((track, i) => (
                <TrackCard key={`chill-card-${track.id}-${i}`} track={track} queue={chillHits} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Empty Fallback */}
      {indonesianHits.length === 0 && globalHits.length === 0 && chillHits.length === 0 && (
        <div
          className="text-center pt-20"
          style={{ color: "var(--color-text-muted)" }}
        >
          <p className="text-sm">Mencari lagu untuk memulai...</p>
        </div>
      )}
    </div>
  );
}
