"use client";

import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

let audioElement: HTMLAudioElement | null = null;
let currentTrackId: string | null = null;
let isInitialized = false;

export function getAudio(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "true");
    audioElement.setAttribute("webkit-playsinline", "true");
    audioElement.setAttribute("x-webkit-airplay", "allow");
  }
  return audioElement;
}

// ─── MediaSession (lock screen & notification controls) ───────────────────

function setupMediaSessionActionHandlers() {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", () => {
    usePlayerStore.getState().play();
    getAudio().play().catch(() => {});
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    usePlayerStore.getState().pause();
    getAudio().pause();
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    usePlayerStore.getState().previous();
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    usePlayerStore.getState().next();
  });

  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime !== undefined) {
      const audio = getAudio();
      audio.currentTime = details.seekTime;
      usePlayerStore.getState().setCurrentTime(details.seekTime);
      syncMediaSessionPosition();
    }
  });

  navigator.mediaSession.setActionHandler("seekbackward", (details) => {
    const audio = getAudio();
    const newPos = Math.max(0, audio.currentTime - (details.seekOffset ?? 10));
    audio.currentTime = newPos;
    usePlayerStore.getState().setCurrentTime(newPos);
    syncMediaSessionPosition();
  });

  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    const audio = getAudio();
    const dur = audio.duration || usePlayerStore.getState().duration || Infinity;
    const newPos = Math.min(dur, audio.currentTime + (details.seekOffset ?? 10));
    audio.currentTime = newPos;
    usePlayerStore.getState().setCurrentTime(newPos);
    syncMediaSessionPosition();
  });

  try {
    navigator.mediaSession.setActionHandler("stop", () => {
      usePlayerStore.getState().pause();
      getAudio().pause();
    });
  } catch {
    // optional on some mobile browsers
  }
}

function updateMediaSession(track: Track | null) {
  if (typeof window === "undefined" || !("mediaSession" in navigator) || !track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || "CloudBeats",
    artwork: track.artworkUrl
      ? [
          { src: track.artworkUrl, sizes: "96x96", type: "image/jpeg" },
          { src: track.artworkUrl, sizes: "128x128", type: "image/jpeg" },
          { src: track.artworkUrl, sizes: "256x256", type: "image/jpeg" },
          { src: track.artworkUrl, sizes: "512x512", type: "image/jpeg" },
        ]
      : [],
  });
}

function syncMediaSessionPosition() {
  if (
    typeof window === "undefined" ||
    !("mediaSession" in navigator) ||
    typeof navigator.mediaSession.setPositionState !== "function"
  ) {
    return;
  }

  const audio = getAudio();
  const store = usePlayerStore.getState();
  const dur =
    store.currentTrack?.duration && store.currentTrack.duration > 0
      ? store.currentTrack.duration
      : isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : store.duration;

  if (!isFinite(dur) || dur <= 0) return;
  const pos = Math.min(Math.max(0, audio.currentTime), dur);

  try {
    navigator.mediaSession.setPositionState({
      duration: dur,
      playbackRate: audio.playbackRate || 1,
      position: pos,
    });
  } catch {
    // ignore temporary out of range state
  }
}

// ─── Stream Resolution ────────────────────────────────────────────────────

function getStreamUrl(track: Track): string {
  return `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
}

/** Pre-cache next track stream metadata on the server so playback starts instantly */
async function prefetchNextTrack() {
  const { queue, currentIndex } = usePlayerStore.getState();
  if (!queue || queue.length === 0) return;

  const nextIndex = (currentIndex ?? 0) + 1;
  if (nextIndex < queue.length) {
    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      try {
        await fetch(`/api/stream/${encodeURIComponent(nextTrack.id)}`);
      } catch {
        // pre-fetch non-critical
      }
    }
  }
}

// ─── Main Audio Engine Init ────────────────────────────────────────────────

export function initAudioEngine() {
  if (isInitialized) return;
  isInitialized = true;

  const audio = getAudio();
  const store = usePlayerStore.getState();

  // Attach audio element to DOM body so mobile OS doesn't kill it in background
  if (typeof document !== "undefined" && !document.body.contains(audio)) {
    audio.style.display = "none";
    audio.setAttribute("aria-hidden", "true");
    document.body.appendChild(audio);
  }

  // Setup lock-screen media notification action handlers
  setupMediaSessionActionHandlers();

  // Sync initial track if restored from localStorage
  if (store.currentTrack) {
    updateMediaSession(store.currentTrack);
  }

  // ── Track Completion Handler ───────────────────────────────────────────
  const handleTrackEnded = () => {
    const store = usePlayerStore.getState();
    if (store.status === "ENDED") return;

    if (store.repeatMode === "track") {
      audio.currentTime = 0;
      store.setCurrentTime(0);
      audio.play().catch(() => {});
      return;
    }

    usePlayerStore.getState().setStatus("ENDED");
    usePlayerStore.getState().next();
  };

  // ── Audio Events ────────────────────────────────────────────────────────
  audio.addEventListener("timeupdate", () => {
    const store = usePlayerStore.getState();
    const effectiveDuration =
      store.currentTrack?.duration && store.currentTrack.duration > 0
        ? store.currentTrack.duration
        : store.duration;

    // Auto-advance: If playback reaches or exceeds song duration, immediately transition to next track
    if (effectiveDuration > 0 && audio.currentTime >= effectiveDuration) {
      handleTrackEnded();
      return;
    }

    store.setCurrentTime(audio.currentTime);
    if (Math.round(audio.currentTime) % 4 === 0) {
      syncMediaSessionPosition();
    }
  });

  audio.addEventListener("durationchange", () => {
    const store = usePlayerStore.getState();
    const trackDuration = store.currentTrack?.duration;

    // If the track already has a verified duration from metadata, always preserve it.
    // iOS Safari/WebKit frequently miscalculates AAC stream bitrate and doubles the estimated duration (e.g. 7:47 instead of 3:53).
    if (trackDuration && trackDuration > 0) {
      store.setDuration(trackDuration);
      syncMediaSessionPosition();
      return;
    }

    if (isFinite(audio.duration) && audio.duration > 0) {
      store.setDuration(audio.duration);
      syncMediaSessionPosition();
    }
  });

  audio.addEventListener("waiting", () => {
    usePlayerStore.getState().setBuffering(true);
    usePlayerStore.getState().setStatus("BUFFERING");
  });

  audio.addEventListener("canplay", () => {
    usePlayerStore.getState().setBuffering(false);
  });

  audio.addEventListener("playing", () => {
    usePlayerStore.getState().setBuffering(false);
    usePlayerStore.getState().setStatus("PLAYING");
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    prefetchNextTrack().catch(() => {});
  });

  audio.addEventListener("pause", () => {
    const { status } = usePlayerStore.getState();
    if (status !== "ENDED" && status !== "RESOLVING" && status !== "LOADING") {
      usePlayerStore.getState().setStatus("PAUSED");
    }
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
  });

  audio.addEventListener("ended", () => {
    handleTrackEnded();
  });

  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src") || audio.src === "" || audio.src === window.location.href) {
      return;
    }
    console.error("[AudioEngine] HTMLAudioElement error:", audio.error);
    usePlayerStore.getState().setStatus("ERROR");
    usePlayerStore.getState().setBuffering(false);
  });

  // Mobile user gesture unlocker
  const unlockAudio = () => {
    const a = getAudio();
    if (a && a.paused && usePlayerStore.getState().isPlaying) {
      a.play().catch(() => {});
    }
  };
  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("click", unlockAudio, { passive: true });

  // ── Store Subscriber ───────────────────────────────────────────────────
  usePlayerStore.subscribe((state, prev) => {
    const audio = getAudio();

    // Volume / mute
    if (state.volume !== prev.volume || state.isMuted !== prev.isMuted) {
      audio.volume = state.isMuted ? 0 : state.volume;
    }

    // Track changed → load stream directly
    if (state.currentTrack?.id !== currentTrackId && state.currentTrack) {
      currentTrackId = state.currentTrack.id;

      usePlayerStore.getState().setStatus("LOADING");
      usePlayerStore.getState().setBuffering(true);

      // Pre-set duration immediately so the UI bar is accurate before network loads
      if (state.currentTrack.duration && state.currentTrack.duration > 0) {
        usePlayerStore.getState().setDuration(state.currentTrack.duration);
      }

      // Update MediaSession metadata immediately for lock screen
      updateMediaSession(state.currentTrack);

      // Directly stream via chunked range proxy (206 Partial Content)
      const streamUrl = getStreamUrl(state.currentTrack);
      audio.src = streamUrl;
      audio.load();

      if (state.isPlaying) {
        audio.play().catch((err) => {
          console.warn("[AudioEngine] Autoplay blocked, waiting for gesture:", err.message);
          usePlayerStore.getState().setStatus("PAUSED");
        });
      }
      return;
    }

    // Play / Pause toggle
    if (state.isPlaying !== prev.isPlaying && state.currentTrack?.id === currentTrackId) {
      if (state.isPlaying) {
        audio.play().catch((e) => console.warn("[AudioEngine] play error:", e));
      } else {
        audio.pause();
      }
    }

    // Seek
    if (state.currentTime !== prev.currentTime) {
      if (Math.abs(state.currentTime - audio.currentTime) > 1.5) {
        audio.currentTime = state.currentTime;
      }
    }
  });

  // Initial volume
  audio.volume = store.isMuted ? 0 : store.volume;
}

export function getAudioElement() {
  return audioElement;
}
