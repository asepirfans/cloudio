"use client";

import { useState } from "react";
import {
  Sparkles,
  Coffee,
  HeartCrack,
  Car,
  Zap,
  CloudRain,
  Loader2,
  Radio,
  Play,
} from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

const PRESET_VIBES = [
  {
    label: "Lofi Ngopi",
    prompt: "Lofi ngopi santai",
    icon: Coffee,
  },
  {
    label: "Nostalgia Galau",
    prompt: "Lagu nostalgia galau 2000an",
    icon: HeartCrack,
  },
  {
    label: "Night Drive",
    prompt: "Night drive santai",
    icon: Car,
  },
  {
    label: "Energy Workout",
    prompt: "Workout motivation upbeat gym",
    icon: Zap,
  },
  {
    label: "Hujan Syahdu",
    prompt: "Lagu syahdu suasana hujan",
    icon: CloudRain,
  },
];

interface VibeGeneratorCardProps {
  onVibeGenerated?: (vibeName: string, tracks: Track[]) => void;
}

export function VibeGeneratorCard({ onVibeGenerated }: VibeGeneratorCardProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);

  const generateAndPlayVibe = async (vibePrompt: string, displayLabel?: string) => {
    if (!vibePrompt.trim() || loading) return;

    setLoading(true);
    const label = displayLabel || vibePrompt;
    setActiveVibe(label);

    try {
      const res = await fetch(`/api/vibe?prompt=${encodeURIComponent(vibePrompt.trim())}`);
      if (!res.ok) throw new Error("Gagal mengurasi lagu");
      const data = await res.json();

      if (data.tracks && data.tracks.length > 0) {
        const store = usePlayerStore.getState();
        // Set entire queue and start playing the first track immediately
        store.setQueue(data.tracks, 0);
        store.play(data.tracks[0]);

        if (onVibeGenerated) {
          onVibeGenerated(label, data.tracks);
        }
      }
    } catch (err) {
      console.error("[VibeGeneratorCard]", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      generateAndPlayVibe(prompt);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 md:p-6 mb-8 transition-all"
      style={{
        backgroundColor: "rgba(24, 24, 27, 0.75)",
        borderColor: "rgba(56, 189, 248, 0.2)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* Background ambient glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: "var(--color-accent)" }}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              backgroundColor: "rgba(56, 189, 248, 0.15)",
              color: "var(--color-accent)",
            }}
          >
            <Radio size={18} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              Vibe Radio
            </h2>
          </div>
        </div>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border"
          style={{
            borderColor: "rgba(56, 189, 248, 0.3)",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            color: "var(--color-accent)",
          }}
        >
          Smart Curation
        </span>
      </div>

      <p className="text-xs md:text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
        Ketik suasana hati atau pilih preset di bawah. Cloudio akan langsung mengurasi dan memutar antrean lagu yang pas.
      </p>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Lagi pengen dengar apa? (misal: lagu akustik senja di kafe)"
            disabled={loading}
            className="w-full h-11 px-4 text-sm rounded-xl border outline-none transition-all placeholder:text-zinc-500 focus:border-sky-400"
            style={{
              backgroundColor: "rgba(10, 10, 10, 0.6)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="h-11 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-98 shrink-0"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#0a0a0a",
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Mengurasi...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Generate & Play</span>
            </>
          )}
        </button>
      </form>

      {/* Preset pills (NO emojis, only Lucide icons) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-xs font-medium shrink-0 mr-1" style={{ color: "var(--color-text-muted)" }}>
          Preset:
        </span>
        {PRESET_VIBES.map((vibe) => {
          const IconComponent = vibe.icon;
          const isCurrentActive = activeVibe === vibe.label && loading;
          return (
            <button
              key={vibe.label}
              onClick={() => {
                setPrompt(vibe.prompt);
                generateAndPlayVibe(vibe.prompt, vibe.label);
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer shrink-0 hover:border-sky-400 hover:text-sky-300 active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: "rgba(39, 39, 42, 0.6)",
                borderColor: "rgba(255, 255, 255, 0.08)",
                color: "var(--color-text-secondary)",
              }}
            >
              {isCurrentActive ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <IconComponent size={13} strokeWidth={1.8} />
              )}
              <span>{vibe.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
