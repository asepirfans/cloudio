"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerState, Track, RepeatMode, PlayerStatus } from "@/types/music";
import { audioManager } from "@/audio/AudioManager";

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

      // Playback Controls (delegated to AudioManager singleton)
      play: (track?: Track) => {
        if (track) {
          const { queue } = get();
          const existingIndex = queue.findIndex((t) => t.id === track.id);
          if (existingIndex !== -1) {
            audioManager.setQueue(queue, existingIndex);
          } else {
            audioManager.setQueue([track], 0);
          }
        } else {
          audioManager.resume();
        }
      },

      playSmartQueue: async (track: Track) => {
        await audioManager.playSmartQueue(track);
      },

      pause: () => {
        audioManager.pause();
      },

      togglePlay: () => {
        const { isPlaying, currentTrack } = get();
        if (!currentTrack) return;
        if (isPlaying) {
          audioManager.pause();
        } else {
          audioManager.resume();
        }
      },

      next: () => {
        audioManager.next();
      },

      previous: () => {
        audioManager.previous();
      },

      seek: (time: number) => {
        audioManager.seek(time);
      },

      setVolume: (volume: number) => {
        audioManager.setVolume(volume);
      },

      toggleMute: () => {
        const { isMuted } = get();
        audioManager.setMuted(!isMuted);
      },

      setQueue: (tracks: Track[], startIndex = 0) => {
        audioManager.setQueue(tracks, startIndex);
      },

      addToQueue: (track: Track) => {
        audioManager.addToQueue(track);
      },

      removeFromQueue: (index: number) => {
        audioManager.removeFromQueue(index);
      },

      clearQueue: () => {
        audioManager.clearQueue();
      },

      playNext: (track: Track) => {
        audioManager.playNextInQueue(track);
        set({
          queuePulse: true,
          toast: {
            id: Date.now(),
            message: "Diputar di antrean pertama",
            trackTitle: track.title,
          },
        });
        setTimeout(() => set({ queuePulse: false }), 1500);
        setTimeout(() => set((s) => (s.toast?.id ? { toast: null } : {})), 3500);
      },

      toggleShuffle: () => {
        const { shuffle } = get();
        audioManager.setShuffle(!shuffle);
      },

      toggleAutoplay: () => {
        const { autoplay } = get();
        audioManager.setAutoplay(!autoplay);
      },

      setAutoplay: (autoplay: boolean) => {
        audioManager.setAutoplay(autoplay);
      },

      setRepeatMode: (mode: RepeatMode) => {
        audioManager.setRepeatMode(mode);
      },

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

// Connect AudioManager to sync Zustand UI state
if (typeof window !== "undefined") {
  audioManager.setStoreSync({
    setState: (partial) => usePlayerStore.setState(partial),
    getState: () => usePlayerStore.getState(),
  });
}
