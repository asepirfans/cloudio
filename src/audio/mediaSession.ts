import type { Track } from "@/types/music";
import { audioLogger } from "./logger";

export interface MediaSessionActionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeekTo: (time: number) => void;
  onSeekForward: (offset: number) => void;
  onSeekBackward: (offset: number) => void;
  onStop?: () => void;
}

/**
 * Attaches standard action handlers to navigator.mediaSession.
 * Handles lock-screen / notification controls for Android Chrome and Safari/iOS.
 */
export function setupMediaSession(handlers: MediaSessionActionHandlers) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

  try {
    navigator.mediaSession.setActionHandler("play", () => {
      audioLogger.log("MediaSession action: play");
      handlers.onPlay();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      audioLogger.log("MediaSession action: pause");
      handlers.onPause();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      audioLogger.log("MediaSession action: nexttrack");
      handlers.onNext();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      audioLogger.log("MediaSession action: previoustrack");
      handlers.onPrevious();
    });

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && Number.isFinite(details.seekTime)) {
        handlers.onSeekTo(details.seekTime);
      }
    });

    // Explicitly nullify seekforward and seekbackward so iOS Safari / WebKit lock screen
    // displays the standard [⏮ Previous Track] and [⏭ Next Track] buttons instead of the circular +/- 10s buttons!
    try {
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
    } catch {
      // ignore
    }

    try {
      navigator.mediaSession.setActionHandler("stop", () => {
        handlers.onStop ? handlers.onStop() : handlers.onPause();
      });
    } catch {
      // Optional on some browsers
    }
  } catch (err: any) {
    audioLogger.warn("Error registering MediaSession action handlers:", err?.message || err);
  }
}

/**
 * Updates lock-screen track metadata (title, artist, album, artwork)
 */
export function updateMediaMetadata(track: Track | null) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  try {
    const artwork: MediaImage[] = [];
    if (track.artworkUrl) {
      artwork.push(
        { src: track.artworkUrl, sizes: "96x96", type: "image/jpeg" },
        { src: track.artworkUrl, sizes: "128x128", type: "image/jpeg" },
        { src: track.artworkUrl, sizes: "256x256", type: "image/jpeg" },
        { src: track.artworkUrl, sizes: "512x512", type: "image/jpeg" }
      );
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || "Cloudio",
      artwork,
    });
  } catch (err: any) {
    audioLogger.warn("Failed to set MediaMetadata:", err?.message || err);
  }
}

/**
 * Updates navigator.mediaSession.playbackState ("playing" | "paused" | "none")
 */
export function setMediaSessionPlaybackState(state: "playing" | "paused" | "none") {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch (err: any) {
    // Some older browsers or mobile implementations might throw
  }
}

/**
 * Synchronizes playback duration, position, and rate to the system lock-screen scrubber.
 * Guarded against NaN, negative numbers, or position > duration errors.
 */
export function setMediaSessionPosition(
  position: number,
  duration: number,
  playbackRate: number = 1
) {
  if (
    typeof window === "undefined" ||
    !("mediaSession" in navigator) ||
    typeof navigator.mediaSession.setPositionState !== "function"
  ) {
    return;
  }

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(position) ||
    position < 0
  ) {
    return;
  }

  const safePosition = Math.min(position, duration);

  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
      position: safePosition,
    });
  } catch (err) {
    // Ignore harmless out-of-range temporary states during fast seeks
  }
}
