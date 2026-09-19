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
      autoplay: true,
      priorityQueueCount: 0,
      toast: null,
      queuePulse: false,

      play: (track?: Track) => {
        if (track) {
          const { queue } = get();
          const existingIndex = queue.findIndex((t) => t.id === track.id);
          if (existingIndex !== -1) {
            set({ currentTrack: track, currentIndex: existingIndex, isPlaying: true, status: "RESOLVING", priorityQueueCount: 0 });
          } else {
            set({
              currentTrack: track,
              queue: [track],
              currentIndex: 0,
              isPlaying: true,
              status: "RESOLVING",
              priorityQueueCount: 0,
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
          priorityQueueCount: 0,
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
              if (typeof window !== "undefined") {
                import("@/player/audio-engine").then(({ prefetchNextTrack }) => {
                  prefetchNextTrack().catch(() => {});
                });
              }
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
        const { queue, currentIndex, repeatMode, shuffle, autoplay, currentTrack } = get();
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
            return;
          }

          // Autoplay (Infinite Radio): When queue ends, seamlessly fetch and play similar songs based on the last track
          if (autoplay && currentTrack) {
            set({ status: "LOADING" });
            const lastTrack = currentTrack;
            fetch(
              `/api/recommendations?trackId=${encodeURIComponent(lastTrack.id)}&artist=${encodeURIComponent(lastTrack.artist)}`
            )
              .then((r) => r.json())
              .then((data) => {
                const recs: Track[] = data.tracks || [];
                const current = get();
                if (recs.length > 0) {
                  const existingIds = new Set(current.queue.map((t) => t.id));
                  const filtered = recs.filter((t) => !existingIds.has(t.id));
                  const toUse = filtered.length > 0 ? filtered : recs.filter((t) => t.id !== lastTrack.id);
                  if (toUse.length > 0) {
                    const nextSong = toUse[0];
                    const newQueue = [...current.queue, ...toUse];
                    set({
                      queue: newQueue,
                      currentIndex: current.queue.length,
                      currentTrack: nextSong,
                      isPlaying: true,
                      status: "RESOLVING",
                    });
                    return;
                  }
                }
                set({ isPlaying: false, status: "ENDED" });
              })
              .catch(() => {
                set({ isPlaying: false, status: "ENDED" });
              });
            return;
          }

          set({ isPlaying: false, status: "ENDED" });
          return;
        }

        set((s) => ({
          currentIndex: nextIndex,
          currentTrack: sourceQueue[nextIndex],
          isPlaying: true,
          status: "RESOLVING",
          priorityQueueCount: Math.max(0, (s.priorityQueueCount || 0) - 1),
        }));
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
          priorityQueueCount: 0,
        });
      },

      addToQueue: (track: Track) =>
        set((s) => ({ queue: [...s.queue, track] })),

      removeFromQueue: (index: number) =>
        set((s) => {
          const newQueue = s.queue.filter((_, i) => i !== index);
          const newIndex = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex;
          const wasPriority = index > s.currentIndex && index <= s.currentIndex + (s.priorityQueueCount || 0);
          return {
            queue: newQueue,
            currentIndex: newIndex,
            priorityQueueCount: wasPriority ? Math.max(0, (s.priorityQueueCount || 0) - 1) : s.priorityQueueCount,
          };
        }),

      clearQueue: () =>
        set((s) => ({
          queue: s.currentTrack ? [s.currentTrack] : [],
          currentIndex: 0,
          priorityQueueCount: 0,
        })),

      playNext: (track: Track) => {
        set((s) => {
          if (s.queue.length === 0 || !s.currentTrack) {
            return {
              queue: [track],
              currentIndex: 0,
              currentTrack: track,
              priorityQueueCount: 0,
              queuePulse: true,
              toast: {
                id: Date.now(),
                message: "Diputar di antrean pertama",
                trackTitle: track.title,
              },
            };
          }

          // Remove any existing duplicate of this track from upcoming queue (after currentIndex)
          const upcoming = s.queue.slice(s.currentIndex + 1).filter((t) => t.id !== track.id);
          const historyAndCurrent = s.queue.slice(0, s.currentIndex + 1);

          // Insert after currentTrack + any previous user priority tracks
          const priorityCount = s.priorityQueueCount || 0;
          const insertOffset = Math.min(upcoming.length, priorityCount);

          const newUpcoming = [
            ...upcoming.slice(0, insertOffset),
            track,
            ...upcoming.slice(insertOffset),
          ];

          return {
            queue: [...historyAndCurrent, ...newUpcoming],
            priorityQueueCount: priorityCount + 1,
            queuePulse: true,
            toast: {
              id: Date.now(),
              message: "Ditambahkan ke antrean berikutnya",
              trackTitle: track.title,
            },
          };
        });

        // Reset pulse after 1.5s
        setTimeout(() => set({ queuePulse: false }), 1500);

        // Auto dismiss toast after 3.5s
        setTimeout(() => {
          set((s) => (s.toast?.id ? { toast: null } : {}));
        }, 3500);
      },

      toggleShuffle: () =>
        set((s) => {
          const newShuffle = !s.shuffle;
          if (newShuffle) {
            shuffledQueue = shuffleArray(s.queue);
          }
          return { shuffle: newShuffle };
        }),

      toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
      setAutoplay: (autoplay: boolean) => set({ autoplay }),

      setRepeatMode: (mode: RepeatMode) => set({ repeatMode: mode }),

      setShowFullPlayer: (show: boolean) => set({ showFullPlayer: show }),
      setShowQueue: (show: boolean) => set({ showQueue: show }),
      setShowLyrics: (show: boolean) => set({ showLyrics: show }),

      setStatus: (status: PlayerStatus) => set({ status }),
      setCurrentTime: (currentTime: number) => set({ currentTime }),
      setDuration: (duration: number) => set({ duration }),
      setBuffering: (isBuffering: boolean) => set({ isBuffering }),

      showQueueToast: (message: string, trackTitle?: string) => {
        set({
          toast: { id: Date.now(), message, trackTitle },
          queuePulse: true,
        });
        setTimeout(() => set({ queuePulse: false }), 1500);
        setTimeout(() => set((s) => (s.toast?.id ? { toast: null } : {})), 3500);
      },

      hideQueueToast: () => set({ toast: null }),

      openQueue: () => {
        set({
          showLyrics: false,
          showQueue: true,
          showFullPlayer: true,
        });
      },
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
        autoplay: state.autoplay,
        priorityQueueCount: state.priorityQueueCount,
      }),
    }
  )
);
