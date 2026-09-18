"use client";

/**
 * Background Audio Anchor & Wake Lock Utility
 * Keeps mobile browsers (iOS Safari, Android Chrome) playing audio
 * and preserves MediaSession lock-screen controls when the screen is locked or turned off.
 */

let silentAudioElement: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;

// Clean, 2-second silent WAV loop (base64)
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

/**
 * Starts the silent background audio loop.
 * Mobile OS treats this as an active audio session and prevents killing the tab on lock screen.
 */
export function startBackgroundAudioAnchor() {
  if (typeof window === "undefined") return;

  try {
    if (!silentAudioElement) {
      silentAudioElement = new Audio(SILENT_WAV_DATA_URI);
      silentAudioElement.loop = true;
      silentAudioElement.volume = 0.01; // Low volume so OS treats it as audible output
      silentAudioElement.setAttribute("playsinline", "true");
      silentAudioElement.setAttribute("webkit-playsinline", "true");
    }

    const p = silentAudioElement.play();
    if (p) {
      p.catch(() => {
        // Silently catch if autoplay gesture required; will play on next user tap
      });
    }
  } catch (err) {
    console.warn("[BackgroundAudio] Could not start audio anchor:", err);
  }
}

/**
 * Pauses the background audio loop.
 */
export function pauseBackgroundAudioAnchor() {
  if (silentAudioElement) {
    try {
      silentAudioElement.pause();
    } catch {
      // ignore
    }
  }
}

/**
 * Request Screen Wake Lock (e.g. while lyrics or full player are active)
 */
export async function requestScreenWakeLock() {
  if (typeof window === "undefined") return;
  if ("wakeLock" in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
    } catch {
      // Wake lock request failed or not allowed
    }
  }
}

/**
 * Release Screen Wake Lock
 */
export function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
      wakeLockSentinel = null;
    } catch {
      // ignore
    }
  }
}
