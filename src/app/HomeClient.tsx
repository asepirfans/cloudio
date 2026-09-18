"use client";

import { useState } from "react";
import { TrackCard } from "@/components/track/TrackCard";
import { TrackRow } from "@/components/track/TrackRow";
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
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const { queue: recentQueue, currentTrack } = usePlayerStore();

  const indonesianHits = sections.indonesianHits || [];
  const globalHits = sections.globalHits || [];
  const chillHits = sections.chillHits || [];

  const recentlyPlayed = currentTrack
    ? [currentTrack, ...recentQueue.filter((t) => t.id !== currentTrack.id)].slice(0, 8)
    : recentQueue.slice(0, 8);

  const tabs: { id: CategoryTab; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "indonesia", label: "Indonesia" },
    { id: "global", label: "Internasional" },
    { id: "chill", label: "Akustik" },
  ];

  return (
    <div className="px-4 pt-6 pb-6 max-w-4xl mx-auto">
      {/* Greeting & Header */}
      <div className="mb-4">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          {getGreeting()}
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          Lagu dan daftar putar terpopuler hari ini
        </p>
      </div>

      {/* Category Pills Filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-4 px-4">
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
            {recentlyPlayed.map((track) => (
              <TrackCard key={track.id} track={track} queue={recentlyPlayed} />
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
                  key={track.id}
                  track={track}
                  index={i}
                  useSmartQueue
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {indonesianHits.slice(0, 10).map((track) => (
                <TrackCard key={track.id} track={track} queue={indonesianHits} />
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
            {(activeTab === "global" ? globalHits : globalHits.slice(0, 6)).map((track, i) => (
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
                  key={track.id}
                  track={track}
                  index={i}
                  useSmartQueue
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {chillHits.slice(0, 10).map((track) => (
                <TrackCard key={track.id} track={track} queue={chillHits} />
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
