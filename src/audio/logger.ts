/**
 * Structured Audio Logger for Cloudio
 * Provides prefixed, configurable logging for playback lifecycle,
 * background transitions, and media session synchronization.
 */

class AudioLogger {
  private enabled: boolean;

  constructor() {
    this.enabled =
      process.env.NODE_ENV !== "production" ||
      (typeof window !== "undefined" &&
        ((window as any).__CLOUDIO_AUDIO_DEBUG__ === true ||
          localStorage.getItem("cloudio_audio_debug") === "1"));
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public log(msg: string, ...args: any[]) {
    if (this.enabled) {
      console.log(`[AUDIO] ${msg}`, ...args);
    }
  }

  public warn(msg: string, ...args: any[]) {
    if (this.enabled) {
      console.warn(`[AUDIO] ${msg}`, ...args);
    }
  }

  public error(msg: string, ...args: any[]) {
    console.error(`[AUDIO] ${msg}`, ...args);
  }
}

export const audioLogger = new AudioLogger();
