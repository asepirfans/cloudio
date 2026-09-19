"use client";

import { audioManager } from "@/audio/AudioManager";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

/**
 * Returns the singleton HTMLAudioElement instance.
 */
export function getAudio(): HTMLAudioElement {
  return audioManager.getAudioElement();
}

export function getAudioElement(): HTMLAudioElement | null {
  return audioManager.getAudioElement();
}

/**
 * Initializes the AudioManager singleton.
 * Called once at the root layout via GlobalAudioEngine.
 */
export function initAudioEngine() {
  if (typeof window === "undefined") return;

  // Ensure store sync is wired
  audioManager.setStoreSync({
    setState: (partial) => usePlayerStore.setState(partial),
    getState: () => usePlayerStore.getState(),
  });

  // Hydrate initial resume state if available
  audioManager.restoreResumeState();
  if (typeof (usePlayerStore as any).persist?.onFinishHydration === "function") {
    (usePlayerStore as any).persist.onFinishHydration(() => {
      audioManager.restoreResumeState();
    });
  }
}

/**
 * Directly initiates audio playback from a user tap/click event.
 * Runs inside the user gesture event loop to satisfy mobile browser autoplay policies.
 */
export function playTrackDirectly(
  track: Track,
  options?: {
    queue?: Track[];
    index?: number;
    useSmartQueue?: boolean;
  }
) {
  const store = usePlayerStore.getState();

  // If already playing this track, toggle play/pause
  if (store.currentTrack?.id === track.id) {
    if (store.isPlaying) {
      audioManager.pause();
    } else {
      audioManager.resume();
    }
    return;
  }

  if (options?.queue && options.queue.length > 0) {
    const idx =
      options.index !== undefined && options.index >= 0
        ? options.index
        : options.queue.findIndex((t) => t.id === track.id);
    audioManager.setQueue(options.queue, idx !== -1 ? idx : 0);
  } else if (options?.useSmartQueue) {
    store.playSmartQueue(track);
  } else {
    audioManager.setQueue([track], 0);
  }
}

export function prefetchNextTrack() {
  audioManager.prepareNextTrack();
}

export function saveCurrentResumeState(force = false) {
  audioManager.saveResumeState(force);
}

export function restoreResumeState() {
  audioManager.restoreResumeState();
}
