import type { Track, RepeatMode } from "@/types/music";
import { QueueManager } from "./queue";
import { prewarmNextTrack, prewarmTrackMetadata, retainPreparedTracks, getPreparedTrackUrl, getResolvedDuration, rememberResolvedDuration } from "./preload";
import {
  setupMediaSession,
  updateMediaMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPosition,
} from "./mediaSession";
import { audioLogger } from "./logger";
import { getSyncOfflineTrackUrl } from "@/services/offline-storage";

// Python allows 35s to open a stream. Give it time to return before retrying.
const STREAM_WAIT_MS = 40000;
const STALLED_WAIT_MS = 12000;
const REMOTE_NAVIGATION_COOLDOWN_MS = 450;
const MAX_FAILED_TRACKS = 3;
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
  private playbackGeneration = 0;
  private resolvedDuration: number | null = null;
  private durationRequest: AbortController | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private completedGeneration = -1;
  private hasStartedCurrentTrack = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryAttempts = 0;
  private recommendationRequest: AbortController | null = null;
  private lastPrewarmTime = 0;
  private consecutiveFailures = 0;
  private playRequest = 0;
  private recoveryDeadline = 0;
  private lastProgressTime = 0;
  private observedPosition = 0;
  private positionChangedAt = 0;
  private nextRecommendationAt = 0;
  private shouldBePlaying: boolean = false;
  private pendingSeekTime: number | null = null;
  private lastResumeSaveTime: number = 0;
  private lastSyncedSecond: number = -1;
  private lastRemoteNavigationAt = 0;
  private hasPreloadedNearEnd = false;

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
      this.audio.setAttribute("playsinline", "true");
      this.audio.setAttribute("webkit-playsinline", "true");
      this.audio.setAttribute("x-webkit-airplay", "allow");
      (window as any).__cloudbeats_audio__ = this.audio;
    }

    // Safari supports an explicit playback category for background media.
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
    } catch { /* Optional API. The audio element remains the playback owner. */ }

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
   * Keeps a single media element attached across page navigation.
   * Background scheduling remains controlled by the browser.
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
      // play means a request was accepted, not that audio is flowing yet.
      this.rebindMediaSessionActions();
    });

    this.audio.addEventListener("playing", () => {
      if (!this.shouldBePlaying) return;
      this.hasStartedCurrentTrack = true;
      this.resetProgressObservation();
      this.trace("media.playing");
      this.scheduleEndCheck();
      this.clearRecoveryTimer();
      this.syncStore({ isPlaying: true, status: "PLAYING", isBuffering: false });
      setMediaSessionPlaybackState("playing");
      setMediaSessionPosition(this.audio.currentTime, this.getEffectiveDuration(), 1);
      this.rebindMediaSessionActions();
      this.saveResumeState(true);
      this.prepareNextTrack();
    });

    this.audio.addEventListener("pause", () => {
      // Source selection may emit pause while the next track is loading.
      if (this.isTransitioning) return;

      if (this.shouldBePlaying) {
        this.trace("media.unexpected-pause");
        this.scheduleRecovery();
      }
      if (!this.shouldBePlaying) {
        audioLogger.log(`Track paused: ${this.currentTrack?.id}`);
        this.syncStore({ isPlaying: false, status: "PAUSED" });
        setMediaSessionPlaybackState("paused");
        this.saveResumeState(true);
      }
    });

    this.audio.addEventListener("timeupdate", () => {
      if (this.checkTrackBoundary("timeupdate")) return;
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

      if (this.shouldBePlaying && !this.audio.paused && this.audio.readyState >= 3 && curTime > this.lastProgressTime) {
        this.clearRecoveryTimer();
        if (curTime >= 2) this.consecutiveFailures = 0;
      }
      this.lastProgressTime = curTime;
      // Refresh stale warm metadata during long tracks, without fetching every tick.
      if (this.shouldBePlaying && Date.now() - this.lastPrewarmTime > 15000) {
        this.lastPrewarmTime = Date.now();
        this.prepareNextTrack();
      }

      // Preload next track 10-15s before current track finishes so lock-screen switch is instantaneous
      if (this.shouldBePlaying && effectiveDuration > 0 && effectiveDuration - curTime <= 15 && !this.hasPreloadedNearEnd) {
        this.hasPreloadedNearEnd = true;
        this.prepareNextTrack();
      }

      this.syncStore({ currentTime: curTime });
      this.saveResumeState(false);

      // Smooth 1-second lock-screen progress updates
      if (Math.floor(curTime) !== this.lastSyncedSecond) {
        this.lastSyncedSecond = Math.floor(curTime);
        setMediaSessionPosition(curTime, effectiveDuration, this.audio.playbackRate || 1);
      }
    });

    this.audio.addEventListener("durationchange", () => {
      this.trace("media.durationchange");
      this.scheduleEndCheck();
      const trackDur = this.resolvedDuration || this.currentTrack?.duration;
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
      if (!this.shouldBePlaying) return;
      this.trace("media.waiting");
      this.syncStore({ isBuffering: true, isPlaying: false, status: "BUFFERING" });
      this.keepMediaSessionActive();
      setMediaSessionPosition(this.audio.currentTime, this.getEffectiveDuration(), 1);
      this.scheduleRecovery(this.hasStartedCurrentTrack ? STALLED_WAIT_MS : STREAM_WAIT_MS);
    });

    this.audio.addEventListener("loadedmetadata", () => {
      if (this.pendingSeekTime !== null) {
        try { this.audio.currentTime = this.pendingSeekTime; } catch { /* Retry on the next ready event. */ }
      }
      this.trace("media.metadata");
    });

    this.audio.addEventListener("canplay", () => {
      if (this.shouldBePlaying && this.audio.paused) this.requestPlay();
    });

    this.audio.addEventListener("stalled", () => {
      this.trace("media.stalled");
      if (this.shouldBePlaying) this.keepMediaSessionActive();
      this.scheduleRecovery(this.hasStartedCurrentTrack ? STALLED_WAIT_MS : STREAM_WAIT_MS);
    });

    this.audio.addEventListener("ended", () => {
      this.trace("media.ended-event");
      // A queued event from the previous source must not advance the new one.
      if (this.audio.ended) this.handleTrackEnded();
    });
    this.audio.addEventListener("seeking", () => {
      this.resetProgressObservation();
      this.trace("media.seeking");
      this.clearEndTimer();
    });
    this.audio.addEventListener("seeked", () => {
      this.resetProgressObservation();
      this.trace("media.seeked");
      if (!this.checkTrackBoundary("seeked")) this.scheduleEndCheck();
    });
    this.audio.addEventListener("ratechange", () => this.scheduleEndCheck());

    this.audio.addEventListener("error", () => {
      if (!this.audio.src || this.audio.src === "" || this.audio.src === window.location.href) {
        return;
      }
      const code = this.audio.error?.code;

      // Ignore aborted requests (code 1 = MEDIA_ERR_ABORTED) — occurs normally when switching tracks or backgrounding
      if (!code || code === 1) {
        return;
      }

      this.trace("media.error", { code });

      if (this.shouldBePlaying) this.recoverPlayback();
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
        this.requestPlay();
      }
    };
    window.addEventListener("touchend", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
  }

  private setupMediaSessionHandlers() {
    setupMediaSession({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onNext: () => this.handleRemoteNavigation("next"),
      onPrevious: () => this.handleRemoteNavigation("previous"),
      onSeekTo: (time, fastSeek) => this.seek(time, fastSeek),
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

  private rebindMediaSessionActions() {
    this.setupMediaSessionHandlers();
  }

  private keepMediaSessionActive() {
    if (!this.shouldBePlaying) return;
    setMediaSessionPlaybackState("playing");
    this.rebindMediaSessionActions();
  }

  private handleRemoteNavigation(direction: "next" | "previous") {
    const now = Date.now();
    // WebKit can release callbacks accumulated during suspension in one burst.
    // Replacing src for every stale callback leaves the final request stuck.
    if (now - this.lastRemoteNavigationAt < REMOTE_NAVIGATION_COOLDOWN_MS) {
      this.trace("remote.navigation-suppressed", { direction });
      return;
    }
    this.lastRemoteNavigationAt = now;
    this.trace(direction === "next" ? "remote.next" : "remote.previous");
    if (direction === "next") this.next();
    else this.previous();
  }

  // ─── Playback Controls ───────────────────────────────────────────────────

  public play(track?: Track) {
    this.trace("control.play");
    this.consecutiveFailures = 0;
    if (track) {
      this.currentTrack = track;
      this.queue.setQueue([track], 0);
      this.loadAndPlayCurrentTrack();
      return;
    }
    if (!this.currentTrack) return;
    this.shouldBePlaying = true;
    this.recoveryAttempts = 0;
    if (this.audio.error) {
      this.loadAndPlayCurrentTrack(true);
      return;
    }
    this.requestPlay();
    this.scheduleRecovery();
  }

  public pause() {
    this.trace("control.pause");
    this.clearEndTimer();
    this.shouldBePlaying = false;
    this.playRequest++;
    this.cancelPendingRecommendations();
    this.clearRecoveryTimer();
    this.audio.pause();
    this.syncStore({ isPlaying: false, isBuffering: false, status: "PAUSED" });
    setMediaSessionPlaybackState("paused");
    setMediaSessionPosition(this.audio.currentTime, this.getEffectiveDuration(), 0);
  }

  public resume() {
    this.play();
  }

  public seek(time: number, fastSeek = false) {
    if (!Number.isFinite(time)) return;
    try {
      const targetTime = Math.max(0, this.resolvedDuration ? Math.min(time, this.resolvedDuration) : time);
      this.clearEndTimer();
      this.trace("control.seek", { targetTime });
      if (fastSeek && "fastSeek" in this.audio && typeof (this.audio as any).fastSeek === "function") {
        (this.audio as any).fastSeek(targetTime);
      } else {
        this.audio.currentTime = targetTime;
      }
      this.syncStore({ currentTime: targetTime });
      this.scheduleEndCheck();
      setMediaSessionPosition(
        targetTime,
        this.getEffectiveDuration(),
        this.audio.paused ? 0 : (this.audio.playbackRate || 1)
      );
    } catch (e) {
      audioLogger.warn("Seek error:", e);
    }
  }

  public next() {
    this.trace("control.next");
    this.cancelPendingRecommendations();
    this.consecutiveFailures = 0;
    this.playNext(true);
  }

  public previous() {
    this.trace("control.previous");
    this.cancelPendingRecommendations();
    this.consecutiveFailures = 0;
    this.playPrevious();
  }

  /**
   * Internal track completion handler.
   * Runs natively inside the 'ended' event loop without depending on React re-render.
   */
  private handleTrackEnded() {
    if (!this.shouldBePlaying || this.isTransitioning || this.completedGeneration === this.playbackGeneration) return;
    this.completedGeneration = this.playbackGeneration;
    this.clearEndTimer();
    this.trace("media.ended");
    this.clearRecoveryTimer();
    try { localStorage.removeItem(RESUME_STORAGE_KEY); } catch {}
    if (this.queue.getRepeatMode() === "track" && this.currentTrack) {
      this.audio.currentTime = 0;
      this.completedGeneration = -1;
      this.scheduleEndCheck();
      this.requestPlay();
      this.scheduleRecovery();
      return;
    }
    this.playNext();
  }

  /**
   * Transitions to the next track using the exact same HTMLAudioElement instance.
   */
  private playNext(skipRepeat = false) {
    this.clearEndTimer();
    this.playRequest++;
    this.clearRecoveryTimer();
    const nextTrack = this.queue.advance(skipRepeat);

    if (!nextTrack) {
      // If queue ended and autoplay (Infinite Radio) is enabled, fetch more recommendations
      if (this.queue.isAutoplay() && this.currentTrack) {
        void this.handleAutoplayQueueReplenish();
        return;
      }

      audioLogger.log("Queue ended, no further tracks");
      this.shouldBePlaying = false;
      this.audio.pause();
      this.syncStore({ isPlaying: false, isBuffering: false, status: "ENDED" });
      setMediaSessionPlaybackState("none");
      return;
    }

    const prevTrackId = this.currentTrack?.id || "none";
    audioLogger.log(`Transitioning ${prevTrackId} -> ${nextTrack.id}`);

    this.currentTrack = nextTrack;

    this.loadAndPlayCurrentTrack();
  }

  private playPrevious() {
    // If > 3 seconds in, restart track
    if (this.audio.currentTime > 3 && !this.audio.paused && this.audio.readyState >= 3 && !this.audio.error) {
      this.audio.currentTime = 0;
      this.syncStore({ currentTime: 0 });
      this.scheduleEndCheck();
      this.shouldBePlaying = true;
      this.recoveryAttempts = 0;
      this.scheduleRecovery();
      this.requestPlay();
      return;
    }

    const prevTrack = this.queue.retreat();
    if (!prevTrack) return;

    this.currentTrack = prevTrack;
    this.loadAndPlayCurrentTrack();
  }

  /**
   * Loads the current track stream and initiates playback.
   */
  private loadAndPlayCurrentTrack(forceRefresh = false) {
    if (!this.currentTrack) return;

    this.cancelPendingRecommendations();
    const track = this.currentTrack;
    this.clearEndTimer();
    this.durationRequest?.abort();
    this.resolvedDuration = getResolvedDuration(track.id);
    this.hasStartedCurrentTrack = false;
    this.resetProgressObservation();
    ++this.playbackGeneration;
    this.playRequest++;
    this.lastProgressTime = 0;
    this.clearRecoveryTimer();
    this.recoveryAttempts = 0;
    this.pendingSeekTime = null;
    this.lastSyncedSecond = -1;
    this.shouldBePlaying = true;
    this.hasPreloadedNearEnd = false;

    // Publish metadata immediately, and keep mediaSession playing so lock-screen does not drop session.
    updateMediaMetadata(track);
    setMediaSessionPlaybackState(this.shouldBePlaying ? "playing" : "paused");
    if (track.duration && track.duration > 0) {
      setMediaSessionPosition(0, track.duration, this.shouldBePlaying ? 1 : 0);
    }

    this.syncStore({
      currentTrack: track,
      currentIndex: this.queue.getCurrentIndex(),
      queue: this.queue.getRawQueue(),
      duration: track.duration || 0,
      currentTime: 0,
      status: "LOADING",
      isBuffering: true,
      isPlaying: false,
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });

    // 2. Set stream URL on the persistent HTMLAudioElement
    const streamUrl = this.getStreamUrl(track, forceRefresh);
    this.isTransitioning = true;
    try { this.audio.src = streamUrl; } finally { this.isTransitioning = false; }
    this.trace("track.load", { forceRefresh });
    void this.resolveCurrentDuration();
    // Assigning src starts resource selection. Avoid an additional load() reset
    // at the lock-screen boundary; request playback in this same event handler.

    this.requestPlay();
    this.scheduleRecovery();
    this.prepareNextTrack();
  }

  // Every play attempt is scoped to both the selected track and latest command.
  private requestPlay() {
    if (!this.shouldBePlaying || !this.currentTrack) return;
    const generation = this.playbackGeneration;
    const request = ++this.playRequest;
    this.trace("play.request");
    try {
      void this.audio.play().then(() => {
        if (generation !== this.playbackGeneration || request !== this.playRequest || !this.shouldBePlaying) return;
        this.hasStartedCurrentTrack = true;
        this.trace("play.resolved");
        this.scheduleEndCheck();
        this.clearRecoveryTimer();
        this.syncStore({ isPlaying: true, status: "PLAYING", isBuffering: false });
        setMediaSessionPlaybackState("playing");
        setMediaSessionPosition(this.audio.currentTime, this.getEffectiveDuration(), 1);
        this.prepareNextTrack();
      }).catch((error) => {
        if (generation !== this.playbackGeneration || request !== this.playRequest || !this.shouldBePlaying) return;
        this.trace("play.rejected", { name: error?.name || "Error" });
        this.syncStore({ isPlaying: false, isBuffering: true, status: "BUFFERING" });
        this.scheduleRecovery();
      });
    } catch (error) {
      audioLogger.warn("play.exception", error);
      this.scheduleRecovery();
    }
  }

  // ─── Queue Operations ────────────────────────────────────────────────────

  public setQueue(tracks: Track[], startIndex: number = 0) {
    this.cancelPendingRecommendations();
    this.consecutiveFailures = 0;
    this.queue.setQueue(tracks, startIndex);
    const track = this.queue.getCurrentTrack();
    if (track) {
      this.currentTrack = track;
      this.loadAndPlayCurrentTrack();
    }
  }

  public async playSmartQueue(track: Track) {
    this.nextRecommendationAt = 0;
    this.setQueue([track], 0);
    if (!this.recommendationRequest) await this.replenishAutoplayQueue(false);
  }

  public addToQueue(track: Track) {
    this.queue.addToQueue(track);
    this.syncStore({ queue: this.queue.getRawQueue() });
    this.prepareNextTrack();
  }

  public playNextInQueue(track: Track) {
    this.queue.playNext(track);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });
    this.prepareNextTrack();
  }

  public removeFromQueue(index: number) {
    this.queue.removeFromQueue(index);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      currentIndex: this.queue.getCurrentIndex(),
      priorityQueueCount: this.queue.getPriorityQueueCount(),
    });
    this.prepareNextTrack();
  }

  public clearQueue() {
    this.queue.clearQueue(true);
    this.syncStore({
      queue: this.queue.getRawQueue(),
      currentIndex: this.queue.getCurrentIndex(),
      priorityQueueCount: 0,
    });
    this.prepareNextTrack();
  }

  public setShuffle(shuffle: boolean) {
    this.queue.setShuffle(shuffle);
    this.syncStore({
      shuffle: this.queue.isShuffle(),
      currentIndex: this.queue.getCurrentIndex(),
    });
    this.prepareNextTrack();
  }

  public setRepeatMode(mode: RepeatMode) {
    this.queue.setRepeatMode(mode);
    this.syncStore({ repeatMode: mode });
    this.prepareNextTrack();
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
    const upcoming = this.queue.getUpcomingTracks(2);
    // Keep preparation for the new current track alive across a fast A -> B
    // transition. Resolve two successors, but fetch a prefix only for nearest.
    retainPreparedTracks([
      ...(this.currentTrack ? [this.currentTrack.id] : []),
      ...upcoming.map(track => track.id),
    ]);
    if (upcoming[0]) void prewarmNextTrack(upcoming[0]);
    if (upcoming[1]) void prewarmTrackMetadata(upcoming[1]);
    const remaining = this.queue.getTracks().length - this.queue.getCurrentIndex();
    if (this.queue.isAutoplay() && remaining <= 3 && !this.recommendationRequest && Date.now() >= this.nextRecommendationAt) {
      void this.replenishAutoplayQueue(false);
    }
  }

  private handleAutoplayQueueReplenish() {
    this.cancelPendingRecommendations();
    this.shouldBePlaying = true;
    this.audio.pause();
    this.clearRecoveryTimer();
    this.syncStore({ status: "LOADING", isPlaying: false, isBuffering: true });
    void this.replenishAutoplayQueue(true);
  }

  private async replenishAutoplayQueue(advanceWhenReady: boolean) {
    if (!this.currentTrack || this.recommendationRequest) return;
    const generation = this.playbackGeneration;
    const controller = new AbortController();
    this.recommendationRequest = controller;
    this.nextRecommendationAt = Date.now() + 15000;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    const seed = this.queue.getTracks().at(-1) || this.currentTrack;
    try {
      const response = await fetch(`/api/recommendations?trackId=${encodeURIComponent(seed.id)}&artist=${encodeURIComponent(seed.artist)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Recommendations HTTP ${response.status}`);
      const data = await response.json();
      if (controller.signal.aborted || generation !== this.playbackGeneration) return;
      this.queue.appendTracks(data.tracks || []);
      this.syncStore({ queue: this.queue.getRawQueue() });
      if (advanceWhenReady && this.shouldBePlaying) {
        const next = this.queue.advance(true);
        if (next) {
          this.currentTrack = next;
          this.loadAndPlayCurrentTrack();
          return;
        }
      } else {
        this.prepareNextTrack();
        return;
      }
    } catch (error) {
      audioLogger.warn("recommendations.failed", error);
    } finally {
      clearTimeout(timeout);
      if (this.recommendationRequest === controller) this.recommendationRequest = null;
    }
    if (advanceWhenReady && generation === this.playbackGeneration && this.shouldBePlaying && (!controller.signal.aborted || timedOut)) {
      this.shouldBePlaying = false;
      this.syncStore({ isPlaying: false, isBuffering: false, status: "ENDED" });
      setMediaSessionPlaybackState("paused");
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

    this.trace("visibility.resume");
    if (this.checkTrackBoundary("foreground")) return;
    this.scheduleEndCheck();
    if (this.recommendationRequest && this.audio.ended) return;

    // An unpaused element can still be waiting for network data.
    const isPlayingMidTrack = !isPaused && this.audio.readyState >= 3 && (dur === 0 || curTime < dur - 1.5);
    if (isPlayingMidTrack) {
      this.syncStore({
        currentTime: curTime,
        duration: dur,
        isPlaying: true,
        status: "PLAYING",
      });
      return;
    }

    // 2. Only recover if the track has genuinely reached the end AND playback is halted
    const trackFinished = isEnded;

    if (trackFinished && isPaused && this.shouldBePlaying && !this.isTransitioning) {
      audioLogger.log("recovering queue transition");
      this.handleTrackEnded();
      return;
    }

    if (this.shouldBePlaying && !trackFinished) {
      // Re-enter play synchronously on foreground without restarting an active
      // resolver request or spending a retry just because visibility changed.
      if (this.audio.paused) this.requestPlay();
      if (this.recoveryDeadline && Date.now() >= this.recoveryDeadline) this.recoverPlayback();
      else this.scheduleRecovery();
      return;
    }

    // 3. Reconcile Zustand UI state with actual audio element reality
    this.syncStore({
      currentTime: curTime,
      duration: dur,
      isPlaying: !isPaused,
      status: isPaused ? (this.shouldBePlaying ? "BUFFERING" : "PAUSED") : "PLAYING",
    });
  }

  private cancelPendingRecommendations() {
    if (!this.recommendationRequest) return;
    this.recommendationRequest.abort();
    this.recommendationRequest = null;
  }

  private clearRecoveryTimer() {
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.recoveryDeadline = 0;
  }

  private scheduleRecovery(delay = STREAM_WAIT_MS) {
    if (!this.shouldBePlaying) return;
    const nextDeadline = Date.now() + delay;
    if (this.recoveryTimer !== null) {
      if (this.recoveryDeadline <= nextDeadline) return;
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    const generation = this.playbackGeneration;
    this.recoveryDeadline = nextDeadline;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (generation === this.playbackGeneration) this.recoverPlayback();
    }, delay);
  }

  private recoverPlayback() {
    if (!this.currentTrack || !this.shouldBePlaying) return;
    this.clearRecoveryTimer();
    if (this.checkTrackBoundary("recovery")) return;
    this.trace("recovery.start", { attempt: this.recoveryAttempts });
    if (this.recoveryAttempts >= 1) {
      this.consecutiveFailures++;
      this.trace("recovery.exhausted", { failures: this.consecutiveFailures });
      // Skip unavailable tracks, but stop rather than loop forever through failures.
      const next = this.queue.getNextTrack();
      if (this.consecutiveFailures < MAX_FAILED_TRACKS && next && next.id !== this.currentTrack.id) {
        this.playNext(true);
        return;
      }
      this.shouldBePlaying = false;
      this.clearEndTimer();
      this.playRequest++;
      this.audio.pause();
      this.syncStore({ isPlaying: false, isBuffering: false, status: "ERROR" });
      setMediaSessionPlaybackState("paused");
      return;
    }
    this.recoveryAttempts++;
    const position = this.audio.currentTime;
    // Replace the failed request once; use the direct Python endpoint for YTM
    // so its 35s opening budget matches this player's 40s watchdog.
    this.playRequest++;
    this.pendingSeekTime = Number.isFinite(position) && position > 0 ? position : null;
    this.hasStartedCurrentTrack = false;
    this.clearEndTimer();
    this.audio.src = this.getStreamUrl(this.currentTrack, true);
    this.resetProgressObservation();
    this.syncStore({ isPlaying: false, isBuffering: true, status: "BUFFERING" });
    this.keepMediaSessionActive();
    this.requestPlay();
    this.scheduleRecovery();
  }

  private async resolveCurrentDuration() {
    const track = this.currentTrack;
    if (!track || this.resolvedDuration || track.provider !== "ytm") return;
    const generation = this.playbackGeneration;
    const controller = new AbortController();
    this.durationRequest = controller;
    try {
      const response = await fetch(`/api/resolve/${encodeURIComponent(track.id)}`, {
        method: "POST", cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (controller.signal.aborted || generation !== this.playbackGeneration || data.status !== "warmed" || data.trackId !== track.id) return;
      rememberResolvedDuration(track.id, data.duration);
      this.resolvedDuration = getResolvedDuration(track.id);
      this.trace("duration.resolved");
      if (this.resolvedDuration) {
        this.syncStore({ duration: this.resolvedDuration });
        this.scheduleEndCheck();
      }
    } catch (error) {
      if (!controller.signal.aborted) audioLogger.warn("duration.resolve-failed", error);
    } finally {
      if (this.durationRequest === controller) this.durationRequest = null;
    }
  }

  private clearEndTimer() {
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private checkTrackBoundary(trigger: string): boolean {
    if (!this.shouldBePlaying || !this.hasStartedCurrentTrack || this.isTransitioning || this.audio.seeking || this.pendingSeekTime !== null) return false;
    if (this.completedGeneration === this.playbackGeneration) return true;
    // Resolver metadata belongs to the exact video ID. Never use a catalog-only
    // duration or elapsed wall time: seeks and buffering make those unsafe.
    const overrun = this.resolvedDuration !== null && Number.isFinite(this.audio.currentTime)
      && this.audio.currentTime >= this.resolvedDuration + 2;
    const idleMs = this.observeProgress();
    // Only accept a missing ended event after the verified tail was buffered
    // and actual media position stopped moving. Duration alone is insufficient.
    const duration = this.resolvedDuration;
    const buffered = this.audio.buffered;
    const bufferedTail = duration !== null && buffered && buffered.length > 0
      && buffered.start(buffered.length - 1) <= this.audio.currentTime
      && buffered.end(buffered.length - 1) >= duration - 0.05;
    const stoppedAtTail = duration !== null && this.audio.currentTime >= duration - 0.25
      && bufferedTail && idleMs >= STALLED_WAIT_MS;
    if (!this.audio.ended && !overrun && !stoppedAtTail) return false;
    this.trace("boundary.fallback", { trigger });
    this.handleTrackEnded();
    return true;
  }

  private resetProgressObservation() {
    this.observedPosition = this.audio.currentTime;
    this.positionChangedAt = Date.now();
  }

  private observeProgress(): number {
    if (Math.abs(this.audio.currentTime - this.observedPosition) > 0.01) {
      this.resetProgressObservation();
    }
    return Date.now() - this.positionChangedAt;
  }

  private scheduleEndCheck() {
    this.clearEndTimer();
    if (!this.shouldBePlaying || !this.hasStartedCurrentTrack || this.audio.seeking || this.completedGeneration === this.playbackGeneration) return;
    const generation = this.playbackGeneration;
    const rate = this.audio.playbackRate > 0 ? this.audio.playbackRate : 1;
    const remainingMs = this.resolvedDuration
      ? (this.resolvedDuration + 2 - this.audio.currentTime) * 1000 / rate : 5000;
    // Re-read actual media position, never infer completion from timer expiry.
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      if (generation !== this.playbackGeneration) return;
      if (this.checkTrackBoundary("timer")) return;
      // Detect a silent hang even when the browser emits no waiting/stalled.
      // Delayed callbacks only inspect position; elapsed time never proves EOF.
      if (this.observeProgress() >= STREAM_WAIT_MS) {
        this.recoverPlayback();
        return;
      }
      this.scheduleEndCheck();
    }, Math.max(500, Math.min(5000, remainingMs)));
  }

  private trace(event: string, details: Record<string, unknown> = {}) {
    audioLogger.log(event, {
      trackId: this.currentTrack?.id, generation: this.playbackGeneration,
      time: this.audio?.currentTime, readyState: this.audio?.readyState,
      networkState: this.audio?.networkState, paused: this.audio?.paused,
      intendedPlaying: this.shouldBePlaying, ...details,
      nativeDuration: Number.isFinite(this.audio?.duration) ? this.audio.duration : null,
      resolvedDuration: this.resolvedDuration, catalogDuration: this.currentTrack?.duration,
      ended: this.audio?.ended, seeking: this.audio?.seeking, playbackRate: this.audio?.playbackRate,
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
    if (this.resolvedDuration) return this.resolvedDuration;
    if (this.currentTrack?.duration && this.currentTrack.duration > 0) {
      return this.currentTrack.duration;
    }
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return 0;
  }

  private getStreamUrl(track: Track, forceRefresh = false): string {
    const offlineUrl = forceRefresh ? null : getSyncOfflineTrackUrl(track.id);
    if (offlineUrl) {
      return offlineUrl;
    }
    const preparedUrl = forceRefresh ? null : getPreparedTrackUrl(track.id);
    if (preparedUrl) {
      return preparedUrl;
    }

    const parts = track.id.split(":");
    const provider = parts.length > 1 ? parts[0] : (track.provider || "ytm");
    const providerTrackId = parts.length > 1 ? parts.slice(1).join(":") : track.id;

    if (provider === "ytm") {
      const resolverBase = (process.env.NEXT_PUBLIC_RESOLVER_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");
      return `${resolverBase}/stream?id=${encodeURIComponent(providerTrackId)}${forceRefresh ? "&refresh=1" : ""}`;
    }

    return `/api/stream/${encodeURIComponent(track.id)}?audio=true${forceRefresh ? "&refresh=1" : ""}`;
  }
}

export const audioManager = AudioManager.getInstance();
