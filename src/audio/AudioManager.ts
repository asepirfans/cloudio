import type { Track, RepeatMode, PlayerStatus } from "@/types/music";
import { QueueManager } from "./queue";
import { prewarmNextTrack } from "./preload";
import {
  setupMediaSession,
  updateMediaMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPosition,
} from "./mediaSession";
import { audioLogger } from "./logger";
import { getSyncOfflineTrackUrl, isTrackOffline } from "@/services/offline-storage";

// Storage key for preserving resume position across reloads
const RESUME_STORAGE_KEY = "cloudbeats_playback_resume";

export interface AudioManagerStoreSync {
  setState: (state: Partial<any>) => void;
  getState: () => any;
}

export class AudioManager {
  private static instance: AudioManager | null = null;

  // Single persistent HTML5 Audio element
  private audio!: HTMLAudioElement;

  // Dedicated queue manager
  private queue: QueueManager;

  // Active track
  private currentTrack: Track | null = null;

  // State guards
  private isTransitioning: boolean = false;
  private nextTrackPrepared: boolean = false;
  private shouldBePlaying: boolean = false;
  private endedWhileBackgrounded: boolean = false;
  private lastFailedTrackId: string | null = null;
  private pendingSeekTime: number | null = null;
  private lastResumeSaveTime: number = 0;
  private isPrefetchingAutoplay: boolean = false;

  // Store sync hook
  private storeSync: AudioManagerStoreSync | null = null;

  private constructor() {
    this.queue = new QueueManager();

    if (typeof window !== "undefined") {
      this.initBrowserAudio();
    } else {
      this.audio = null as any;
    }
  }

  private initBrowserAudio() {
    if (typeof window === "undefined") return;
    if (this.audio) return;

    if ((window as any).__cloudbeats_audio__) {
      this.audio = (window as any).__cloudbeats_audio__;
    } else {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.crossOrigin = "anonymous";
      this.audio.setAttribute("playsinline", "true");
      this.audio.setAttribute("webkit-playsinline", "true");
      this.audio.setAttribute("x-webkit-airplay", "allow");
      (window as any).__cloudbeats_audio__ = this.audio;
    }

    this.attachToDOM();
    this.bindAudioEvents();
    this.bindLifecycleEvents();
    this.bindUserGestureUnlock();
    this.setupMediaSessionHandlers();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public getAudioElement(): HTMLAudioElement {
    if (!this.audio && typeof window !== "undefined") {
      this.initBrowserAudio();
    }
    return this.audio;
  }

  public setStoreSync(sync: AudioManagerStoreSync) {
    this.storeSync = sync;
  }

  private syncStore(partialState: Record<string, any>) {
    if (this.storeSync) {
      this.storeSync.setState(partialState);
    }
  }

  /**
   * Attaches the audio element to the DOM body.
   * Required for mobile browsers (especially WebKit / iOS Safari PWA)
   * so the media pipeline is not garbage-collected when the screen turns off.
   */
  private attachToDOM() {
    if (typeof document !== "undefined" && document.body && !document.body.contains(this.audio)) {
      this.audio.style.display = "none";
      this.audio.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.audio);
    }
  }

  // ─── Event Binding ────────────────────────────────────────────────────────

  private bindAudioEvents() {
    this.audio.addEventListener("play", () => {
      this.shouldBePlaying = true;
      audioLogger.log(`Track started: ${this.currentTrack?.id || "unknown"}`);
      this.syncStore({ isPlaying: true, status: "PLAYING", isBuffering: false });
      setMediaSessionPlaybackState("playing");
      this.saveResumeState(true);
    });

    this.audio.addEventListener("playing", () => {
      this.shouldBePlaying = true;
      this.syncStore({ isPlaying: true, status: "PLAYING", isBuffering: false });
      setMediaSessionPlaybackState("playing");
    });

    this.audio.addEventListener("pause", () => {
      // If we are currently transitioning to the next track, do NOT mark state as paused
      // Doing so causes the mobile OS to immediately terminate background playback
      if (this.isTransitioning) return;

      if (!this.shouldBePlaying) {
        audioLogger.log(`Track paused: ${this.currentTrack?.id}`);
        this.syncStore({ isPlaying: false, status: "PAUSED" });
        setMediaSessionPlaybackState("paused");
        this.saveResumeState(true);
      }
    });

    this.audio.addEventListener("timeupdate", () => {
      // Guard: don't overwrite position if we are applying a resume seek
      if (this.pendingSeekTime !== null) {
        if (
          Math.abs(this.audio.currentTime - this.pendingSeekTime) <= 1.5 ||
          this.audio.currentTime >= this.pendingSeekTime
        ) {
          this.pendingSeekTime = null;
        } else {
          return;
        }
      }

      const curTime = this.audio.currentTime;
      const effectiveDuration = this.getEffectiveDuration();

      // Next-track prewarming: 20-30s before track ends
      const remaining = effectiveDuration - curTime;
      if (
        Number.isFinite(remaining) &&
        effectiveDuration > 25 &&
        remaining <= 25 &&
        !this.nextTrackPrepared
      ) {
        this.nextTrackPrepared = true;
        this.prepareNextTrack();
      }

      // Safety-net auto-advance only if ended event failed to fire after 1.5s past duration
      if (
        effectiveDuration > 0 &&
        curTime >= effectiveDuration + 1.5 &&
        !this.isTransitioning
      ) {
        audioLogger.warn("Duration exceeded without ended event, triggering safety advance");
        this.handleTrackEnded();
        return;
      }

      this.syncStore({ currentTime: curTime });
      this.saveResumeState(false);

      // Periodically update lock-screen progress
      if (Math.round(curTime) % 3 === 0) {
        setMediaSessionPosition(curTime, effectiveDuration, this.audio.playbackRate || 1);
      }
    });

    this.audio.addEventListener("durationchange", () => {
      const trackDur = this.currentTrack?.duration;
      // Preserve verified duration from metadata to protect against iOS AAC bitrate misestimation
      if (trackDur && trackDur > 0) {
        this.syncStore({ duration: trackDur });
        setMediaSessionPosition(this.audio.currentTime, trackDur);
        return;
      }

      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.syncStore({ duration: this.audio.duration });
        setMediaSessionPosition(this.audio.currentTime, this.audio.duration);
      }
    });

    this.audio.addEventListener("waiting", () => {
      this.syncStore({ isBuffering: true, status: "BUFFERING" });
    });

    this.audio.addEventListener("canplay", () => {
      this.syncStore({ isBuffering: false });
      if (this.shouldBePlaying && this.audio.paused && !this.isTransitioning) {
        this.audio.play().catch((err) => {
          audioLogger.warn("Play on canplay deferred:", err?.message || err);
        });
      }
    });

    this.audio.addEventListener("stalled", () => {
      audioLogger.warn("Audio stream stalled, network may be slow");
    });

    this.audio.addEventListener("ended", () => {
      audioLogger.log("Current track ended");
      this.handleTrackEnded();
    });

    this.audio.addEventListener("error", () => {
      if (!this.audio.src || this.audio.src === "" || this.audio.src === window.location.href) {
        return;
      }
      const code = this.audio.error?.code;
      const msg = this.audio.error?.message;
      audioLogger.error(`Audio error: code=${code}, message=${msg}`);

      if (this.currentTrack && this.lastFailedTrackId !== this.currentTrack.id) {
        this.lastFailedTrackId = this.currentTrack.id;
        audioLogger.warn(`Retrying track with refresh=1 for: ${this.currentTrack.id}`);
        this.audio.src = `/api/stream/${encodeURIComponent(this.currentTrack.id)}?audio=true&refresh=1&t=${Date.now()}`;
        this.audio.load();
        this.audio.play().catch(() => {});
        return;
      }

      this.syncStore({ status: "ERROR", isBuffering: false });

      // Automatically advance to next track after 1.5s failure delay
      setTimeout(() => {
        if (!this.audio.paused && this.shouldBePlaying) return;
        audioLogger.warn("Skipping to next track after stream failure...");
        this.next();
      }, 1500);
    });
  }

  private bindLifecycleEvents() {
    window.addEventListener("beforeunload", () => this.saveResumeState(true));
    window.addEventListener("pagehide", () => this.saveResumeState(true));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        audioLogger.log("visibility = hidden");
        this.saveResumeState(true);
      } else if (document.visibilityState === "visible") {
        audioLogger.log("visibility = visible");
        this.reconcileBackgroundState();
      }
    });
  }

  private bindUserGestureUnlock() {
    const unlock = () => {
      if (this.shouldBePlaying && this.audio.paused && this.currentTrack) {
        this.audio.play().catch(() => {});
      }
    };
    window.addEventListener("touchend", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
  }

  private setupMediaSessionHandlers() {
    setupMediaSession({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onNext: () => this.next(),
      onPrevious: () => this.previous(),
      onSeekTo: (time) => this.seek(time),
      onSeekForward: (offset) => {
        const cur = this.audio.currentTime;
        const dur = this.getEffectiveDuration();
        this.seek(Math.min(dur, cur + offset));
      },
      onSeekBackward: (offset) => {
        const cur = this.audio.currentTime;
        this.seek(Math.max(0, cur - offset));
      },
      onStop: () => this.pause(),
    });
  }

  // ─── Playback Controls ───────────────────────────────────────────────────

  public async play(track?: Track) {
    if (track) {
      this.currentTrack = track;
      this.queue.setQueue([track], 0);
      await this.loadAndPlayCurrentTrack();
      return;
    }

    this.shouldBePlaying = true;
    try {
      await this.audio.play();
      this.syncStore({ isPlaying: true });
      setMediaSessionPlaybackState("playing");
    } catch (err: any) {
      audioLogger.warn("Audio play() rejected:", err?.message || err);
    }
  }

  public pause() {
    this.shouldBePlaying = false;
    this.audio.pause();
    this.syncStore({ isPlaying: false, status: "PAUSED" });
    setMediaSessionPlaybackState("paused");
  }

  public resume() {
    this.play();
  }

  public seek(time: number) {
    if (!Number.isFinite(time)) return;
    try {
      this.audio.currentTime = Math.max(0, time);
      this.syncStore({ currentTime: this.audio.currentTime });
      setMediaSessionPosition(this.audio.currentTime, this.getEffectiveDuration());
    } catch (e) {
      audioLogger.warn("Seek error:", e);
    }
  }

  public async next() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    try {
      await this.playNext();
    } finally {
      this.isTransitioning = false;
    }
  }

  public async previous() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    try {
      await this.playPrevious();
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Internal track completion handler.
   * Runs natively inside the 'ended' event loop without depending on React re-render.
   */
  private async handleTrackEnded() {
    if (document.visibilityState === "hidden") {
      this.endedWhileBackgrounded = true;
      audioLogger.log("ended while backgrounded");
    }

    try {
      localStorage.removeItem(RESUME_STORAGE_KEY);
    } catch {}

    if (this.queue.getRepeatMode() === "track" && this.currentTrack) {
      audioLogger.log(`Repeat track: replaying ${this.currentTrack.id}`);
      this.audio.currentTime = 0;
      this.syncStore({ currentTime: 0, isPlaying: true, status: "PLAYING" });
      this.audio.play().catch(() => {});
      return;
    }

    // Keep MediaSession alive during track boundary
    setMediaSessionPlaybackState("playing");

    if (this.isTransitioning) return;
    this.isTransitioning = true;

    try {
      await this.playNext();
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Transitions to the next track using the exact same HTMLAudioElement instance.
   */
  private async playNext() {
    const nextTrack = this.queue.advance();

    if (!nextTrack) {
      // If queue ended and autoplay (Infinite Radio) is enabled, fetch more recommendations
      if (this.queue.isAutoplay() && this.currentTrack) {
        await this.handleAutoplayQueueReplenish();
        return;
      }

      audioLogger.log("Queue ended, no further tracks");
      this.shouldBePlaying = false;
      this.syncStore({ isPlaying: false, status: "ENDED" });
      setMediaSessionPlaybackState("none");
      return;
    }

    const prevTrackId = this.currentTrack?.id || "none";
    audioLogger.log(`Transitioning ${prevTrackId} -> ${nextTrack.id}`);

    this.currentTrack = nextTrack;
    this.nextTrackPrepared = false;

    await this.loadAndPlayCurrentTrack();
  }

  private async playPrevious() {
    // If > 3 seconds in, restart track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      this.syncStore({ currentTime: 0 });
      await this.audio.play().catch(() => {});
      return;
    }

    const prevTrack = this.queue.retreat();
    if (!prevTrack) return;

    this.currentTrack = prevTrack;
    this.nextTrackPrepared = false;
    await this.loadAndPlayCurrentTrack();
  }

  /**
   * Loads the current track stream and initiates playback.
   */
  private async loadAndPlayCurrentTrack() {
    if (!this.currentTrack) return;

    const track = this.currentTrack;
    this.shouldBePlaying = true;

    // 1. Immediately update UI & lock screen metadata
    updateMediaMetadata(track);
    setMediaSessionPlaybackState("playing");

    this.syncStore({
      currentTrack: track,
      currentIndex: this.queue.getCurrentIndex(),
      queue: this.queue.getRawQueue(),
      duration: track.duration || 0,
      status: "LOADING",
      isBuffering: true,
      isPlaying: true,
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });

    // 2. Set stream URL on the persistent HTMLAudioElement
    const streamUrl = this.getStreamUrl(track);
    this.audio.src = streamUrl;
    this.audio.load();

    // 3. Initiate playback
    try {
      await this.audio.play();
      audioLogger.log("audio.play() resolved");
      this.syncStore({ isPlaying: true, status: "PLAYING", isBuffering: false });
      setMediaSessionPlaybackState("playing");
    } catch (err: any) {
      audioLogger.warn("audio.play() rejected (awaiting buffer or gesture):", err?.message || err);
      // Keep isPlaying: true so lock-screen stays active
    }

    // Proactively prewarm next track & replenish autoplay queue in background
    setTimeout(() => {
      this.prepareNextTrack();
    }, 1500);
  }

  // ─── Queue Operations ────────────────────────────────────────────────────

  public setQueue(tracks: Track[], startIndex: number = 0) {
    this.queue.setQueue(tracks, startIndex);
    const track = this.queue.getCurrentTrack();
    if (track) {
      this.currentTrack = track;
      this.nextTrackPrepared = false;
      this.loadAndPlayCurrentTrack();
    }
  }

  public addToQueue(track: Track) {
    this.queue.addToQueue(track);
    this.syncStore({ queue: this.queue.getRawQueue() });
  }

  public playNextInQueue(track: Track) {
    this.queue.playNext(track);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });
  }

  public removeFromQueue(index: number) {
    this.queue.removeFromQueue(index);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      currentIndex: this.queue.getCurrentIndex(),
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });
  }

  public clearQueue() {
    this.queue.clearQueue(true);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      currentIndex: this.queue.getCurrentIndex(),
      priorityQueueCount: 0,
    });
  }

  public setShuffle(shuffle: boolean) {
    this.queue.setShuffle(shuffle);
    this.syncStore({
      shuffle: this.queue.isShuffle(),
      currentIndex: this.queue.getCurrentIndex(),
    });
  }

  public setRepeatMode(mode: RepeatMode) {
    this.queue.setRepeatMode(mode);
    this.syncStore({ repeatMode: mode });
  }

  public setAutoplay(autoplay: boolean) {
    this.queue.setAutoplay(autoplay);
    this.syncStore({ autoplay });
  }

  public setVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = clamped;
    this.syncStore({ volume: clamped, isMuted: clamped === 0 });
  }

  public setMuted(muted: boolean) {
    this.audio.muted = muted;
    this.syncStore({ isMuted: muted });
  }

  // ─── Pre-warming & Autoplay ──────────────────────────────────────────────

  public prepareNextTrack() {
    const nextTrack = this.queue.getNextTrack();
    if (nextTrack) {
      prewarmNextTrack(nextTrack).catch(() => {});
    }

    // Check if autoplay replenishment is needed (when <= 3 tracks left in queue)
    const active = this.queue.getTracks();
    const curIdx = this.queue.getCurrentIndex();
    const remaining = active.length - curIdx;

    if (this.queue.isAutoplay() && remaining <= 3 && !this.isPrefetchingAutoplay) {
      this.replenishAutoplayQueue();
    }
  }

  private async handleAutoplayQueueReplenish() {
    if (!this.currentTrack) return;
    this.syncStore({ status: "LOADING" });

    try {
      const res = await fetch(
        `/api/recommendations?trackId=${encodeURIComponent(this.currentTrack.id)}&artist=${encodeURIComponent(this.currentTrack.artist)}`
      );
      if (res.ok) {
        const data = await res.json();
        const recs: Track[] = data.tracks || [];
        if (recs.length > 0) {
          this.queue.appendTracks(recs);
          this.syncStore({ queue: this.queue.getRawQueue() });
          const next = this.queue.advance();
          if (next) {
            this.currentTrack = next;
            await this.loadAndPlayCurrentTrack();
            return;
          }
        }
      }
    } catch (e) {
      audioLogger.warn("Autoplay fetch failed:", e);
    }

    this.shouldBePlaying = false;
    this.syncStore({ isPlaying: false, status: "ENDED" });
  }

  private async replenishAutoplayQueue() {
    if (!this.currentTrack || this.isPrefetchingAutoplay) return;
    this.isPrefetchingAutoplay = true;

    try {
      const queueTracks = this.queue.getTracks();
      const seedTrack = queueTracks[queueTracks.length - 1] || this.currentTrack;

      const res = await fetch(
        `/api/recommendations?trackId=${encodeURIComponent(seedTrack.id)}&artist=${encodeURIComponent(seedTrack.artist)}`
      );
      if (res.ok) {
        const data = await res.json();
        const recs: Track[] = data.tracks || [];
        if (recs.length > 0) {
          this.queue.appendTracks(recs);
          this.syncStore({ queue: this.queue.getRawQueue() });
          audioLogger.log(`Replenished autoplay queue with ${recs.length} tracks`);
        }
      }
    } catch (err) {
      audioLogger.warn("Failed to replenish autoplay queue in background:", err);
    } finally {
      setTimeout(() => {
        this.isPrefetchingAutoplay = false;
      }, 4000);
    }
  }

  // ─── Background Recovery ─────────────────────────────────────────────────

  /**
   * Reconciles audio state when the app returns from background / lock-screen.
   * If the track ended while the phone was locked and the auto-advance was throttled,
   * performs instant auto-advance recovery without double-advancing.
   */
  private reconcileBackgroundState() {
    const isEnded = this.audio.ended;
    const isPaused = this.audio.paused;
    const dur = this.getEffectiveDuration();
    const curTime = this.audio.currentTime;

    const trackFinishedWhileHidden =
      this.endedWhileBackgrounded || isEnded || (dur > 0 && curTime >= dur - 1);

    if (trackFinishedWhileHidden && this.shouldBePlaying && !this.isTransitioning) {
      audioLogger.log("recovering queue transition");
      this.endedWhileBackgrounded = false;
      this.next();
      return;
    }

    // Reconcile Zustand UI state with actual audio element reality
    this.syncStore({
      currentTime: curTime,
      duration: dur,
      isPlaying: !isPaused,
      status: isPaused ? (this.shouldBePlaying ? "BUFFERING" : "PAUSED") : "PLAYING",
    });
  }

  // ─── Persistence / Seek Resume ───────────────────────────────────────────

  public saveResumeState(force = false) {
    if (typeof window === "undefined" || !this.currentTrack) return;

    const now = Date.now();
    if (!force && now - this.lastResumeSaveTime < 1000) return;
    this.lastResumeSaveTime = now;

    const curTime = this.audio.currentTime;
    const dur = this.getEffectiveDuration();

    if (dur > 0 && curTime >= dur - 1) {
      try {
        localStorage.removeItem(RESUME_STORAGE_KEY);
      } catch {}
      return;
    }

    try {
      localStorage.setItem(
        RESUME_STORAGE_KEY,
        JSON.stringify({
          trackId: this.currentTrack.id,
          currentTime: curTime,
          duration: dur,
          isPlaying: this.shouldBePlaying,
          savedAt: now,
        })
      );
    } catch {}
  }

  public restoreResumeState() {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(RESUME_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.trackId) return;

      const resumeTime = Number(saved.currentTime) || 0;
      const resumeDur = Number(saved.duration) || 0;

      if (resumeTime > 1 && (!resumeDur || resumeTime < resumeDur - 2)) {
        this.pendingSeekTime = resumeTime;
        this.syncStore({ currentTime: resumeTime, duration: resumeDur });

        const applySeek = () => {
          if (this.pendingSeekTime !== null && this.pendingSeekTime > 0) {
            try {
              this.audio.currentTime = this.pendingSeekTime;
            } catch {}
          }
        };

        if (this.audio.readyState >= 1) {
          applySeek();
        } else {
          this.audio.addEventListener("loadedmetadata", applySeek, { once: true });
          this.audio.addEventListener("canplay", applySeek, { once: true });
        }
      }
    } catch (e) {
      audioLogger.warn("Error restoring resume state:", e);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getEffectiveDuration(): number {
    if (this.currentTrack?.duration && this.currentTrack.duration > 0) {
      return this.currentTrack.duration;
    }
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return 0;
  }

  private getStreamUrl(track: Track): string {
    const offlineUrl = getSyncOfflineTrackUrl(track.id);
    if (offlineUrl) {
      return offlineUrl;
    }
    return `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
  }
}

export const audioManager = AudioManager.getInstance();
