"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerState, Track, RepeatMode, PlayerStatus } from "@/types/music";

// Shuffle using Fisher-Yates
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let shuffledQueue: Track[] = [];

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      currentIndex: 0,
      status: "IDLE",
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      isMuted: false,
      shuffle: false,
      repeatMode: "off",
      showFullPlayer: false,
      showQueue: false,
      showLyrics: false,

      play: (track?: Track) => {
        if (track) {
          const { queue } = get();
          const existingIndex = queue.findIndex((t) => t.id === track.id);
          if (existingIndex !== -1) {
            set({ currentTrack: track, currentIndex: existingIndex, isPlaying: true, status: "RESOLVING" });
          } else {
            set({
              currentTrack: track,
              queue: [track],
              currentIndex: 0,
              isPlaying: true,
              status: "RESOLVING",
            });
          }
        } else {
          set({ isPlaying: true });
        }
      },

      playSmartQueue: async (track: Track) => {
        // Immediately play the user's chosen track
        set({
          currentTrack: track,
          queue: [track],
          currentIndex: 0,
          isPlaying: true,
          status: "RESOLVING",
        });

        // Fetch smart radio recommendations based on the song and artist
        try {
          const res = await fetch(
            `/api/recommendations?trackId=${encodeURIComponent(track.id)}&artist=${encodeURIComponent(track.artist)}`
          );
          if (res.ok) {
            const data = await res.json();
            const recs: Track[] = data.tracks || [];
            const current = get();
            if (current.currentTrack?.id === track.id && recs.length > 0) {
              const filtered = recs.filter((t) => t.id !== track.id);
              set({ queue: [track, ...filtered] });
            }
          }
        } catch (err) {
          console.warn("[playSmartQueue] failed to fetch recommendations:", err);
        }
      },

      pause: () => set({ isPlaying: false }),

      togglePlay: () => {
        const { isPlaying, currentTrack } = get();
        if (!currentTrack) return;
        set({ isPlaying: !isPlaying });
      },

      next: () => {
        const { queue, currentIndex, repeatMode, shuffle } = get();
        if (queue.length === 0) return;

        if (repeatMode === "track") {
          // Replay current - audio engine handles this
          set({ status: "RESOLVING" });
          return;
        }

        const sourceQueue = shuffle ? shuffledQueue : queue;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= sourceQueue.length) {
          if (repeatMode === "queue") {
            set({ currentIndex: 0, currentTrack: sourceQueue[0], isPlaying: true, status: "RESOLVING" });
          } else {
            set({ isPlaying: false, status: "ENDED" });
          }
          return;
        }

        set({
          currentIndex: nextIndex,
          currentTrack: sourceQueue[nextIndex],
          isPlaying: true,
          status: "RESOLVING",
        });
      },

      previous: () => {
        const { queue, currentIndex, currentTime, shuffle } = get();
        if (queue.length === 0) return;

        // If > 3s played, restart current track
        if (currentTime > 3) {
          set({ currentTime: 0, status: "RESOLVING" });
          return;
        }

        const sourceQueue = shuffle ? shuffledQueue : queue;
        const prevIndex = Math.max(0, currentIndex - 1);
        set({
          currentIndex: prevIndex,
          currentTrack: sourceQueue[prevIndex],
          isPlaying: true,
          status: "RESOLVING",
        });
      },

      seek: (time: number) => set({ currentTime: time }),

      setVolume: (volume: number) => set({ volume: Math.max(0, Math.min(1, volume)) }),

      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      setQueue: (tracks: Track[], startIndex = 0) => {
        if (tracks.length === 0) return;
        const { shuffle } = get();
        if (shuffle) {
          shuffledQueue = shuffleArray(tracks);
        }
        set({
          queue: tracks,
          currentIndex: startIndex,
          currentTrack: tracks[startIndex],
          isPlaying: true,
          status: "RESOLVING",
        });
      },

      addToQueue: (track: Track) =>
        set((s) => ({ queue: [...s.queue, track] })),

      removeFromQueue: (index: number) =>
        set((s) => {
          const newQueue = s.queue.filter((_, i) => i !== index);
          const newIndex = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex;
          return { queue: newQueue, currentIndex: newIndex };
        }),

      clearQueue: () =>
        set((s) => ({
          queue: s.currentTrack ? [s.currentTrack] : [],
          currentIndex: 0,
        })),

      playNext: (track: Track) =>
        set((s) => {
          const after = s.currentIndex + 1;
          const newQueue = [...s.queue.slice(0, after), track, ...s.queue.slice(after)];
          return { queue: newQueue };
        }),

      toggleShuffle: () =>
        set((s) => {
          const newShuffle = !s.shuffle;
          if (newShuffle) {
            shuffledQueue = shuffleArray(s.queue);
          }
          return { shuffle: newShuffle };
        }),

      setRepeatMode: (mode: RepeatMode) => set({ repeatMode: mode }),

      setShowFullPlayer: (show: boolean) => set({ showFullPlayer: show }),
      setShowQueue: (show: boolean) => set({ showQueue: show }),
      setShowLyrics: (show: boolean) => set({ showLyrics: show }),

      setStatus: (status: PlayerStatus) => set({ status }),
      setCurrentTime: (currentTime: number) => set({ currentTime }),
      setDuration: (duration: number) => set({ duration }),
      setBuffering: (isBuffering: boolean) => set({ isBuffering }),
    }),
    {
      name: "player-store",
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        currentIndex: state.currentIndex,
        volume: state.volume,
        isMuted: state.isMuted,
        shuffle: state.shuffle,
        repeatMode: state.repeatMode,
      }),
    }
  )
);
