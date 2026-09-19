"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  Play,
  Loader2,
  Disc3,
  SlidersHorizontal,
  Coffee,
  HeartCrack,
  Car,
  Zap,
  CloudRain,
  Headphones,
  RotateCw,
  Volume2,
} from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import type { Track } from "@/types/music";

interface AiDjSession {
  title: string;
  subtitle: string;
  pitch: string;
  prompt: string;
  djNote: string;
}

function getContextualDjSession(): AiDjSession {
  const h = new Date().getHours();

  if (h >= 0 && h < 5) {
    return {
      title: "Sesi Dini Hari",
      subtitle: "Midnight Serenity",
      pitch: "Suasana tengah malam yang tenang. DJ sudah siapkan petikan akustik dan lofi lembut untuk menenangkan pikiran.",
      prompt: "Lofi akustik tengah malam santai tidur",
      djNote: "Kurasi ini mengutamakan tempo rendah (65-75 BPM) dengan melodi lembut tanpa hentakan drum keras.",
    };
  } else if (h >= 5 && h < 11) {
    return {
      title: "Sesi Pagi Ceria",
      subtitle: "Morning Boost",
      pitch: "Awali harimu dengan melodi segar penambah mood dan semangat positif sebelum mulai beraktivitas.",
      prompt: "Lagu pagi ceria pop akustik semangat",
      djNote: "Melodi bernada ceria dengan progresi mayor untuk meningkatkan fokus dan dopamin pagi.",
    };
  } else if (h >= 11 && h < 15) {
    return {
      title: "Sesi Siang Produktif",
      subtitle: "Focus & Flow",
      pitch: "Ritme dinamis dan beat teratur untuk menjaga ritme kerja agar tetap fokus dan anti-ngantuk.",
      prompt: "Focus work beats produktif instrumental upbeat",
      djNote: "Harmoni instrumen stabil untuk menjaga konsentrasi tinggi tanpa mengganggu fokus membaca atau berpikir.",
    };
  } else if (h >= 15 && h < 19) {
    return {
      title: "Sesi Senja Syahdu",
      subtitle: "Sunset Chill",
      pitch: "Waktu bersantai menjelang malam. Rileks sejenak dengan alunan musik indie dan senja syahdu.",
      prompt: "Lagu indie senja santai akustik",
      djNote: "Petikan gitar hangat dan vokal ekspresif yang pas untuk menemani perjalanan pulang atau bersantai.",
    };
  } else {
    return {
      title: "Sesi Malam Relaksasi",
      subtitle: "Late Night Wind Down",
      pitch: "Malam yang hangat. Nikmati kurasi lagu pilihan untuk melepas lelah dan menyegarkan pikiran.",
      prompt: "Lagu santai malam akustik hangat",
      djNote: "Aransemen bernuansa hangat dengan tempo stabil untuk menurunkan stres setelah seharian beraktivitas.",
    };
  }
}

const DJ_PRESETS = [
  {
    label: "Fokus / Kerja",
    prompt: "Lagu fokus kerja produktif deep focus",
    icon: Headphones,
    note: "Alunan tempo sedang tanpa distorsi untuk menjaga alur konsentrasi maksimal.",
  },
  {
    label: "Lofi Santai",
    prompt: "Lofi ngopi santai",
    icon: Coffee,
    note: "Beats lofi hangat dengan tekstur vinyl vintage yang nyaman di telinga.",
  },
  {
    label: "Nostalgia Galau",
    prompt: "Lagu nostalgia galau 2000an indonesia",
    icon: HeartCrack,
    note: "Koleksi lagu legendaris penuh memori dengan lirik mendalam.",
  },
  {
    label: "Night Drive",
    prompt: "Night drive santai city pop synth",
    icon: Car,
    note: "Bassline mengalun dinamis untuk menemani jalanan malam berhias lampu kota.",
  },
  {
    label: "Energy Workout",
    prompt: "Workout motivation upbeat gym edm",
    icon: Zap,
    note: "Energi maksimal berdentum cepat untuk memompa detak jantung dan daya tahan.",
  },
  {
    label: "Hujan Syahdu",
    prompt: "Lagu syahdu suasana hujan akustik",
    icon: CloudRain,
    note: "Suasana syahdu nan menenangkan berpadu rintik hujan di luar jendela.",
  },
];

interface AiDjCardProps {
  onDjCurated?: (vibeName: string, tracks: Track[]) => void;
}

export function AiDjCard({ onDjCurated }: AiDjCardProps) {
  const [session, setSession] = useState<AiDjSession | null>(null);
  const [showMoodConsole, setShowMoodConsole] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeVibeLabel, setActiveVibeLabel] = useState<string | null>(null);
  const [activeDjNote, setActiveDjNote] = useState<string | null>(null);

  useEffect(() => {
    setSession(getContextualDjSession());
  }, []);

  const runDjCurator = async (prompt: string, label: string, note?: string) => {
    if (loading) return;
    setLoading(true);
    setActiveVibeLabel(label);
    setActiveDjNote(note || session?.djNote || "Kurasi cerdas disesuaikan dengan suasana saat ini.");

    try {
      const res = await fetch(`/api/vibe?prompt=${encodeURIComponent(prompt)}`);
      if (!res.ok) throw new Error("Gagal mengurasi sesi DJ");
      const data = await res.json();

      if (data.tracks && data.tracks.length > 0) {
        const firstTrack = data.tracks[0];
        // Direct playback with complete playlist queue
        playTrackDirectly(firstTrack, {
          queue: data.tracks,
          index: 0,
        });

        if (onDjCurated) {
          onDjCurated(label, data.tracks);
        }
      }
    } catch (err) {
      console.warn("[AiDjCard] Gagal memutar sesi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    runDjCurator(
      customInput.trim(),
      customInput.trim(),
      "Kurasi khusus berdasarkan permintaan suasananmu."
    );
    setShowMoodConsole(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-5 md:p-6 mb-8 transition-all shadow-xl"
      style={{
        backgroundColor: "rgba(18, 18, 22, 0.85)",
        borderColor: "rgba(56, 189, 248, 0.25)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Ambient background glow & visualizer aura */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(circle, #38bdf8 0%, #818cf8 60%, transparent 80%)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full pointer-events-none opacity-15 blur-3xl"
        style={{
          background: "radial-gradient(circle, #0284c7 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Top Header Row */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {/* Pulsing DJ Deck Waveform Orb */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/15 border border-sky-400/30">
            <Disc3 size={17} className="text-sky-400 animate-spin" style={{ animationDuration: "8s" }} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400 ring-2 ring-black animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Cloudio AI DJ
              </h2>
            </div>
            <p className="text-[11px] text-white/50">
              {session?.subtitle || "Smart Mood Curator"}
            </p>
          </div>
        </div>

        {/* Action button to toggle custom mood drawer */}
        <button
          onClick={() => setShowMoodConsole(!showMoodConsole)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer touch-manipulation active:scale-95 ${
            showMoodConsole
              ? "bg-sky-500 text-black font-semibold shadow-md shadow-sky-500/25"
              : "bg-white/5 text-white/70 border border-white/10 hover:text-white hover:bg-white/10"
          }`}
          aria-label="Atur suasana atau request mood"
        >
          <SlidersHorizontal size={13} />
          <span>Ganti Mood</span>
        </button>
      </div>

      {/* Main Pitch / Context Narration */}
      <div className="relative z-10 mb-5">
        <h3 className="text-lg md:text-xl font-bold tracking-tight text-white mb-1">
          {activeVibeLabel ? `Vibe Aktif: ${activeVibeLabel}` : session?.title || "Sesi Khusus Kamu"}
        </h3>
        <p className="text-xs md:text-sm text-white/70 leading-relaxed max-w-xl">
          {activeDjNote || session?.pitch || "Memuat rekomendasi lagu untukmu..."}
        </p>
      </div>

      {/* One-Tap Action Buttons Row */}
      <div className="relative z-10 flex flex-wrap items-center gap-3">
        {/* The Big One-Tap Play Button */}
        <button
          onClick={() => {
            if (session) {
              runDjCurator(session.prompt, session.title, session.djNote);
            }
          }}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-sky-500 text-black font-semibold text-xs md:text-sm shadow-lg shadow-sky-500/25 hover:bg-sky-400 active:scale-95 transition-all cursor-pointer touch-manipulation disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin text-black" />
          ) : (
            <Play size={16} className="fill-black text-black" />
          )}
          <span>{loading ? "Meracik Setlist..." : "Putar Racikan DJ Sekarang"}</span>
        </button>

        {/* Quick Shuffle Vibe Button */}
        {activeVibeLabel && (
          <button
            onClick={() => {
              const otherPresets = DJ_PRESETS.filter((p) => p.label !== activeVibeLabel);
              const randomPreset = otherPresets[Math.floor(Math.random() * otherPresets.length)];
              runDjCurator(randomPreset.prompt, randomPreset.label, randomPreset.note);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white text-xs font-medium transition-all cursor-pointer touch-manipulation active:scale-95"
          >
            <RotateCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Ganti Vibe Acak</span>
          </button>
        )}
      </div>

      {/* Interactive Mood Console (Expands when "Ganti Mood" is toggled) */}
      {showMoodConsole && (
        <div className="relative z-10 mt-5 pt-5 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-xs font-semibold text-white/80 mb-2.5 flex items-center gap-1.5">
            <Sparkles size={13} className="text-sky-400" />
            <span>Pilih Suasana Cepat:</span>
          </p>

          {/* Preset Buttons Grid */}
          <div className="flex flex-wrap gap-2 mb-4">
            {DJ_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = activeVibeLabel === preset.label;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    runDjCurator(preset.prompt, preset.label, preset.note);
                    setShowMoodConsole(false);
                  }}
                  disabled={loading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer touch-manipulation active:scale-95 ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/50 shadow-sm"
                      : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={13} className={isSelected ? "text-sky-400" : "text-white/50"} />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>

          {/* Conversational Prompt Input */}
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Ceritakan ke DJ lagi pengen ngerasain apa..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-400/50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !customInput.trim()}
              className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 text-xs font-medium hover:bg-sky-500/30 transition-all cursor-pointer disabled:opacity-40 shrink-0"
            >
              Racikkan
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
