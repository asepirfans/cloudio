"use client";

import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";
import {
  initOfflineStorage,
  getSyncOfflineTrackUrl,
  getOfflineTrackUrl,
  isTrackOffline,
} from "@/services/offline-storage";

let audioElement: HTMLAudioElement | null = null;
let currentTrackId: string | null = null;
let isInitialized = false;

export function getAudio(): HTMLAudioElement {
  if (typeof window !== "undefined" && (window as any).__cloudbeats_audio__) {
    audioElement = (window as any).__cloudbeats_audio__;
    return audioElement!;
  }

  if (!audioElement) {
    audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "true");
    audioElement.setAttribute("webkit-playsinline", "true");
    audioElement.setAttribute("x-webkit-airplay", "allow");
    if (typeof window !== "undefined") {
      (window as any).__cloudbeats_audio__ = audioElement;
    }
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
    const cur = usePlayerStore.getState().currentTime;
    const newPos = Math.max(0, cur - (details.seekOffset ?? 10));
    const audio = getAudio();
    audio.currentTime = newPos;
    usePlayerStore.getState().setCurrentTime(newPos);
    syncMediaSessionPosition();
  });

  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    const cur = usePlayerStore.getState().currentTime;
    const dur = usePlayerStore.getState().duration || Infinity;
    const newPos = Math.min(dur, cur + (details.seekOffset ?? 10));
    const audio = getAudio();
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
    album: track.album || "Cloudio",
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

const preloadedBlobUrls = new Map<string, string>();

function getStreamUrl(track: Track): string {
  const offlineUrl = getSyncOfflineTrackUrl(track.id);
  if (offlineUrl) {
    return offlineUrl;
  }
  const preloadedUrl = preloadedBlobUrls.get(track.id);
  if (preloadedUrl) {
    return preloadedUrl;
  }
  return `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
}

let isPrefetchingAutoplay = false;
let hasPrefetchedForCurrentTrack = false;
let isBufferingNextTrackBlob = false;

/** Pre-cache next track stream metadata and proactively replenish autoplay queue */
export async function prefetchNextTrack() {
  const { queue, currentIndex, autoplay, currentTrack } = usePlayerStore.getState();
  if (!queue || queue.length === 0) return;

  const nextIndex = (currentIndex ?? 0) + 1;

  // 1. If there is an immediate next track in the queue, pre-buffer its audio in RAM so lock-screen transition is 0ms
  if (nextIndex < queue.length) {
    const nextTrack = queue[nextIndex];
    if (nextTrack && !preloadedBlobUrls.has(nextTrack.id) && !isTrackOffline(nextTrack.id) && !isBufferingNextTrackBlob) {
      isBufferingNextTrackBlob = true;
      try {
        // Trigger server-side resolver pre-resolution so pytubefix runs ahead of time
        fetch(`/api/stream/${encodeURIComponent(nextTrack.id)}`).catch(() => {});

        // Proactively download audio stream into in-memory Blob while current track is actively playing!
        // When current track ends on lock screen, this Blob URL plays in 0ms without waiting for network!
        const audioStreamUrl = `/api/stream/${encodeURIComponent(nextTrack.id)}?audio=true`;
        fetch(audioStreamUrl)
          .then((res) => {
            if (res.ok) return res.blob();
            throw new Error(`Audio stream prefetch status: ${res.status}`);
          })
          .then((blob) => {
            // Clean up old preloaded blobs to free device RAM
            for (const [id, url] of preloadedBlobUrls.entries()) {
              if (id !== nextTrack.id && id !== currentTrack?.id) {
                URL.revokeObjectURL(url);
                preloadedBlobUrls.delete(id);
              }
            }
            const blobUrl = URL.createObjectURL(blob);
            preloadedBlobUrls.set(nextTrack.id, blobUrl);
            console.log(`[AudioEngine] Pre-buffered in-memory audio ready for: ${nextTrack.title} (${Math.round(blob.size / 1024)} KB)`);
          })
          .catch((err) => {
            console.warn("[AudioEngine] Background stream pre-buffering:", err?.message || err);
          })
          .finally(() => {
            isBufferingNextTrackBlob = false;
          });
      } catch {
        isBufferingNextTrackBlob = false;
      }
    }
  }

  // 2. Proactive Autoplay Queue Replenishment (Continuous Infinite Radio):
  // When autoplay is active and 3 or fewer tracks remain in the queue,
  // fetch recommendations based on the last track in the queue and append them in advance!
  const remaining = queue.length - (currentIndex ?? 0);
  if (autoplay && remaining <= 3 && !isPrefetchingAutoplay) {
    isPrefetchingAutoplay = true;
    try {
      const seedTrack = queue[queue.length - 1] || currentTrack;
      if (!seedTrack) return;

      const res = await fetch(
        `/api/recommendations?trackId=${encodeURIComponent(seedTrack.id)}&artist=${encodeURIComponent(seedTrack.artist)}`
      );
      if (res.ok) {
        const data = await res.json();
        const recs: Track[] = data.tracks || [];
        const state = usePlayerStore.getState();
        if (recs.length > 0) {
          const existingIds = new Set(state.queue.map((t) => t.id));
          const filtered = recs.filter((t) => !existingIds.has(t.id));
          const toAdd = filtered.length > 0 ? filtered : recs.filter((t) => t.id !== state.currentTrack?.id);
          if (toAdd.length > 0) {
            console.log(`[Autoplay] Proactively appended ${toAdd.length} recommendations to queue.`);
            usePlayerStore.setState({ queue: [...state.queue, ...toAdd] });
          }
        }
      }
    } catch (err) {
      console.warn("[Autoplay] Failed to prefetch recommendations:", err);
    } finally {
      setTimeout(() => {
        isPrefetchingAutoplay = false;
      }, 3000);
    }
  }
}

// ─── Playback Resume Management (Persistent Seek across Reload) ───────────

const RESUME_STORAGE_KEY = "cloudbeats_playback_resume";

interface SavedResumeState {
  trackId: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  savedAt: number;
}

let pendingSeekTime: number | null = null;
let lastResumeSaveTime = 0;

export function saveCurrentResumeState(force = false) {
  if (typeof window === "undefined") return;
  const store = usePlayerStore.getState();
  const audio = getAudio();

  if (!store.currentTrack) {
    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {}
    return;
  }

  const now = Date.now();
  if (!force && now - lastResumeSaveTime < 1000) {
    return;
  }
  lastResumeSaveTime = now;

  const currentPos = audio.currentTime > 0 ? audio.currentTime : store.currentTime;
  const dur =
    store.currentTrack.duration && store.currentTrack.duration > 0
      ? store.currentTrack.duration
      : audio.duration > 0
      ? audio.duration
      : store.duration;

  // Don't save if track was ended or at the very end
  if (dur > 0 && currentPos >= dur - 1) {
    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {}
    return;
  }

  const stateToSave: SavedResumeState = {
    trackId: store.currentTrack.id,
    currentTime: currentPos,
    duration: dur,
    isPlaying: store.isPlaying,
    savedAt: now,
  };

  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(stateToSave));
  } catch {}
}

export function restoreResumeState() {
  if (typeof window === "undefined") return;
  const store = usePlayerStore.getState();
  const audio = getAudio();

  const savedRaw = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!savedRaw) return;

  try {
    const saved: SavedResumeState = JSON.parse(savedRaw);
    if (!saved || !saved.trackId || !store.currentTrack || saved.trackId !== store.currentTrack.id) {
      return;
    }

    const resumeTime = Number(saved.currentTime) || 0;
    const resumeDur = Number(saved.duration) || store.currentTrack.duration || 0;
    const wasPlaying = Boolean(saved.isPlaying);

    // Only restore if more than 1 second in and not at the end
    if (resumeTime > 1 && (!resumeDur || resumeTime < resumeDur - 2)) {
      pendingSeekTime = resumeTime;
      store.setCurrentTime(resumeTime);
      if (resumeDur > 0) {
        store.setDuration(resumeDur);
      }

      currentTrackId = store.currentTrack.id;
      const streamUrl = getStreamUrl(store.currentTrack);
      const currentSrc = audio.getAttribute("src") || audio.src;

      if (!currentSrc || (!currentSrc.includes(encodeURIComponent(store.currentTrack.id)) && !currentSrc.startsWith("blob:"))) {
        audio.src = streamUrl;
        audio.load();
      }

      const applyResumeSeek = () => {
        if (pendingSeekTime !== null && pendingSeekTime > 0) {
          try {
            audio.currentTime = pendingSeekTime;
          } catch (e) {
            console.warn("[AudioEngine] Error seeking to resume position:", e);
          }
        }
      };

      if (audio.readyState >= 1) {
        applyResumeSeek();
      } else {
        audio.addEventListener("loadedmetadata", applyResumeSeek, { once: true });
        audio.addEventListener("canplay", applyResumeSeek, { once: true });
      }

      if (wasPlaying) {
        usePlayerStore.setState({ isPlaying: true });
        audio.play().catch((err) => {
          if (err?.name === "NotAllowedError") {
            // Browser autoplay policy prevented sound before user interaction.
            // Sync state to paused so UI shows Play button cleanly, and attach one-time interaction resume.
            usePlayerStore.setState({ isPlaying: false, status: "PAUSED" });
            const resumeOnFirstGesture = () => {
              window.removeEventListener("click", resumeOnFirstGesture);
              window.removeEventListener("touchend", resumeOnFirstGesture);
              window.removeEventListener("keydown", resumeOnFirstGesture);
              const curState = usePlayerStore.getState();
              if (curState.currentTrack?.id === saved.trackId && !curState.isPlaying) {
                curState.play();
                audio.play().catch(() => {});
              }
            };
            window.addEventListener("click", resumeOnFirstGesture, { once: true, passive: true });
            window.addEventListener("touchend", resumeOnFirstGesture, { once: true, passive: true });
            window.addEventListener("keydown", resumeOnFirstGesture, { once: true, passive: true });
          } else {
            console.warn("[AudioEngine] Autoplay resume on reload prevented by browser policy:", err);
          }
        });
      }
    }
  } catch (e) {
    console.warn("[AudioEngine] Error restoring resume state:", e);
  }
}

// ─── Main Audio Engine Init ────────────────────────────────────────────────

export function initAudioEngine() {
  if (typeof window !== "undefined" && (window as any).__cloudbeats_initialized__) {
    return;
  }
  if (isInitialized) return;
  isInitialized = true;
  if (typeof window !== "undefined") {
    (window as any).__cloudbeats_initialized__ = true;
  }

  initOfflineStorage().catch(() => {});

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

  // Lifecycle listeners to preserve playback position on reload / tab switch
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => saveCurrentResumeState(true));
    window.addEventListener("pagehide", () => saveCurrentResumeState(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveCurrentResumeState(true);
      }
    });
  }

  // Restore playback position on initial mount / hydration
  restoreResumeState();
  if (typeof (usePlayerStore as any).persist?.onFinishHydration === "function") {
    (usePlayerStore as any).persist.onFinishHydration(() => {
      restoreResumeState();
    });
  }

  // Sync initial track if restored from localStorage
  if (store.currentTrack) {
    updateMediaSession(store.currentTrack);
  }

  // ── Track Completion Handler ───────────────────────────────────────────
  const handleTrackEnded = () => {
    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {}

    const store = usePlayerStore.getState();
    if (store.status === "ENDED") return;

    if (store.repeatMode === "track") {
      audio.currentTime = 0;
      store.setCurrentTime(0);
      audio.play().catch(() => {});
      return;
    }

    // Keep MediaSession playbackState alive across track boundary so mobile OS does not kill background execution
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }

    const { queue, currentIndex, shuffle } = store;
    const sourceQueue = queue;
    const nextIndex = currentIndex + 1;

    // Direct synchronous chaining inside the native ended event (Crucial for iOS WebKit & Android lock screen continuity)
    if (nextIndex < sourceQueue.length) {
      const nextTrack = sourceQueue[nextIndex];
      if (nextTrack) {
        currentTrackId = nextTrack.id;
        hasPrefetchedForCurrentTrack = false;
        updateMediaSession(nextTrack);

        const streamUrl = getStreamUrl(nextTrack);
        audio.src = streamUrl;
        audio.load();
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("[AudioEngine] Background transition play deferred:", err);
          });
        }
      }
    }

    usePlayerStore.getState().next();
  };

  // ── Audio Events ────────────────────────────────────────────────────────
  audio.addEventListener("timeupdate", () => {
    const store = usePlayerStore.getState();

    // Guard: While awaiting the pending seek right after reload, don't overwrite store.currentTime with 0
    if (pendingSeekTime !== null) {
      if (Math.abs(audio.currentTime - pendingSeekTime) <= 2 || audio.currentTime >= pendingSeekTime) {
        pendingSeekTime = null;
      } else {
        return;
      }
    }

    const effectiveDuration =
      store.currentTrack?.duration && store.currentTrack.duration > 0
        ? store.currentTrack.duration
        : store.duration;

    // Proactive background pre-warm: resolve next track ~25s before end so track switch is instant (<50ms)
    if (effectiveDuration > 20 && effectiveDuration - audio.currentTime <= 25 && !hasPrefetchedForCurrentTrack) {
      hasPrefetchedForCurrentTrack = true;
      prefetchNextTrack().catch(() => {});
    }

    // Safety net auto-advance only if ended event fails to fire after 1.5s past duration
    if (effectiveDuration > 0 && audio.currentTime >= effectiveDuration + 1.5) {
      handleTrackEnded();
      return;
    }

    store.setCurrentTime(audio.currentTime);
    saveCurrentResumeState(false);

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
    const store = usePlayerStore.getState();
    if (store.isPlaying && audio.paused) {
      audio.play().catch((err) => {
        // Do not force isPlaying: false on mobile lock-screen
        console.warn("[AudioEngine] Play on canplay deferred:", err?.message || err);
      });
    }
  });

  audio.addEventListener("playing", () => {
    usePlayerStore.getState().setBuffering(false);
    usePlayerStore.getState().setStatus("PLAYING");
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    prefetchNextTrack().catch(() => {});
    saveCurrentResumeState(true);
  });

  audio.addEventListener("pause", () => {
    const { status, isPlaying } = usePlayerStore.getState();
    // Only mark paused if the player store actually intended to pause (user clicked Pause)
    // When a track finishes, the browser temporarily fires 'pause' before 'ended' or before next src.
    // If we mark mediaSession.playbackState = 'paused' here, the mobile OS instantly kills the background audio session!
    if (!isPlaying) {
      if (status !== "ENDED" && status !== "RESOLVING" && status !== "LOADING") {
        usePlayerStore.getState().setStatus("PAUSED");
      }
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      saveCurrentResumeState(true);
    }
  });

  audio.addEventListener("ended", () => {
    handleTrackEnded();
  });

  let lastFailedTrackId: string | null = null;

  audio.addEventListener("error", () => {
    if (!audio.getAttribute("src") || audio.src === "" || audio.src === window.location.href) {
      return;
    }
    const code = audio.error?.code;
    const message = audio.error?.message;
    console.error(`[AudioEngine] HTMLAudioElement error: code=${code}, message=${message}`, audio.error);

    const store = usePlayerStore.getState();
    const currentTrack = store.currentTrack;

    // Self-healing: if an audio load fails, retry ONCE with forceRefresh
    if (currentTrack && lastFailedTrackId !== currentTrack.id) {
      lastFailedTrackId = currentTrack.id;
      console.warn(`[AudioEngine] Retrying playback with force-refresh for: ${currentTrack.title}...`);
      audio.src = `/api/stream/${encodeURIComponent(currentTrack.id)}?audio=true&refresh=1&t=${Date.now()}`;
      audio.load();
      audio.play().catch(() => {});
      return;
    }

    // If retry already failed, mark ERROR and auto-skip to next track in queue after 1.5s
    store.setStatus("ERROR");
    store.setBuffering(false);

    setTimeout(() => {
      const state = usePlayerStore.getState();
      if (state.queue && state.queue.length > 1) {
        console.warn("[AudioEngine] Skipping to next track in queue due to stream error...");
        state.next();
      }
    }, 1500);
  });

  // Mobile user gesture unlocker: whenever user touches or clicks screen, resume if state is playing
  const unlockAudio = () => {
    const a = getAudio();
    const state = usePlayerStore.getState();
    if (a && a.paused && state.isPlaying && state.currentTrack) {
      a.play().catch(() => {});
    }
  };
  window.addEventListener("touchend", unlockAudio, { passive: true });
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
      hasPrefetchedForCurrentTrack = false;

      usePlayerStore.getState().setStatus("LOADING");
      usePlayerStore.getState().setBuffering(true);

      // Pre-set duration immediately so the UI bar is accurate before network loads
      if (state.currentTrack.duration && state.currentTrack.duration > 0) {
        usePlayerStore.getState().setDuration(state.currentTrack.duration);
      }

      // Update MediaSession metadata immediately for lock screen
      updateMediaSession(state.currentTrack);

      // Directly stream via chunked range proxy (206 Partial Content) or local offline blob
      const streamUrl = getStreamUrl(state.currentTrack);
      const currentSrc = audio.getAttribute("src") || audio.src;
      const isMatchingRemote = currentSrc.includes(`/api/stream/${encodeURIComponent(state.currentTrack.id)}`);
      const isMatchingBlob = streamUrl.startsWith("blob:") && currentSrc === streamUrl;

      if (!currentSrc || (!isMatchingRemote && !isMatchingBlob)) {
        audio.src = streamUrl;
      }

      if (state.isPlaying) {
        audio.play().catch((err) => {
          console.warn("[AudioEngine] Autoplay delayed, awaiting buffer or touch:", err.message);
          // Do NOT force status to PAUSED — leave in LOADING/BUFFERING
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

/**
 * Directly initiates audio playback from a user tap/click event.
 * Synchronously primes and invokes audio.play() to satisfy strict mobile browser (iOS Safari / Android Chrome) autoplay policies.
 */
export function playTrackDirectly(
  track: Track,
  options?: {
    queue?: Track[];
    index?: number;
    useSmartQueue?: boolean;
  }
) {
  const audio = getAudio();
  const store = usePlayerStore.getState();

  // If already playing this track, toggle play/pause
  if (store.currentTrack?.id === track.id) {
    if (store.isPlaying) {
      store.pause();
      audio.pause();
    } else {
      store.play();
      audio.play().catch(() => {});
    }
    return;
  }

  // Ensure previous audio is paused before switching source
  try {
    audio.pause();
  } catch {}

  // Update store state immediately
  pendingSeekTime = null;
  currentTrackId = track.id;
  const streamUrl = getStreamUrl(track);

  // Synchronously bind src and invoke play() inside the user gesture event loop!
  audio.src = streamUrl;
  audio.load();
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn("[playTrackDirectly] Immediate play promise rejected, awaiting canplay:", err.message);
    });
  }

  if (options?.queue && options.queue.length > 0) {
    const idx = options.index !== undefined && options.index >= 0 ? options.index : options.queue.findIndex((t) => t.id === track.id);
    store.setQueue(options.queue, idx !== -1 ? idx : 0);
  } else if (options?.useSmartQueue) {
    store.playSmartQueue(track);
  } else {
    store.play(track);
  }

  // Proactively replenish queue recommendations in background so Autoplay is always ready!
  setTimeout(() => {
    prefetchNextTrack().catch(() => {});
  }, 1000);
}

export function getAudioElement() {
  return audioElement;
}
