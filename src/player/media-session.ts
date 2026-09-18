"use client";

/**
 * useMediaSession hook.
 * All MediaSession API metadata, position state, and action handlers
 * are now handled and synchronized directly within src/player/audio-engine.ts
 * to prevent handler conflicts and ensure seamless background/lock-screen playback.
 */
export function useMediaSession() {
  // Handled centrally in audio-engine.ts
}
