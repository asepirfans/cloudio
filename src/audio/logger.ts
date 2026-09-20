const STORAGE_KEY = "cloudio_audio_diagnostics_v1";
const MAX_EVENTS = 200;
type DiagnosticEvent = { at: string; level: string; message: string; details: unknown[]; visibility: string };

// Keep local diagnostics bounded and omit stream URLs, signatures and tokens.
function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name }; // messages may contain signed URLs
  if (typeof value === "string") return value.replace(/(?:https?:\/\/|blob:)[^\s]+/g, "[url]").slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 15)
      .filter(([key]) => !/url|token|secret|sig|title|artist/i.test(key))
      .map(([key, item]) => [key, item !== null && typeof item === "object" ? "[object]" : sanitize(item)]));
  }
  return String(value).slice(0, 100);
}

class AudioLogger {
  private enabled = process.env.NODE_ENV !== "production";
  private events: DiagnosticEvent[] = [];
  private hydrated = false;

  public setEnabled(value: boolean) { this.enabled = value; }
  public isEnabled() { return this.enabled; }

  private hydrate() {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) this.events = saved.slice(-MAX_EVENTS).filter(event =>
        event && typeof event.at === "string" && typeof event.message === "string" && Array.isArray(event.details)
      );
    } catch { /* Storage can be unavailable in private mode. */ }
  }

  private record(level: string, message: string, details: unknown[]) {
    if (typeof window === "undefined") return;
    this.hydrate();
    this.events.push({ at: new Date().toISOString(), level, message: String(sanitize(message)),
      details: details.map(sanitize), visibility: typeof document === "undefined" ? "unknown" : document.visibilityState });
    this.events = this.events.slice(-MAX_EVENTS);
    // Write lifecycle events synchronously so a suspended page need not flush a timer.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events)); } catch { /* Best effort. */ }
  }

  public log(message: string, ...args: unknown[]) {
    this.record("info", message, args);
    if (this.enabled) console.log(`[AUDIO] ${message}`, ...args);
  }
  public warn(message: string, ...args: unknown[]) {
    this.record("warn", message, args);
    if (this.enabled) console.warn(`[AUDIO] ${message}`, ...args);
  }
  public error(message: string, ...args: unknown[]) {
    this.record("error", message, args);
    if (this.enabled) console.error(`[AUDIO] ${message}`, ...args);
  }
  public exportDiagnostics(): string {
    this.hydrate();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events: this.events }, null, 2);
  }
  public clear() {
    this.events = [];
    this.hydrated = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Best effort. */ }
  }
}

export const audioLogger = new AudioLogger();
