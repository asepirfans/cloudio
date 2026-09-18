import { audiusProvider } from "./audius/provider";
import type { MusicProvider } from "./provider";
import type { Track, StreamSource } from "@/types/music";

// Client-side providers (Audius has browser-accessible endpoints)
const providers: MusicProvider[] = [audiusProvider];

const unavailableUntil = new Map<string, number>();

function isSourceAvailable(key: string): boolean {
  const until = unavailableUntil.get(key);
  if (!until) return true;
  if (Date.now() > until) {
    unavailableUntil.delete(key);
    return true;
  }
  return false;
}

function markUnavailable(key: string, durationMs = 5 * 60 * 1000) {
  unavailableUntil.set(key, Date.now() + durationMs);
}

/**
 * Resolve a stream URL for a given track.
 * Uses /api/stream endpoint (which supports YTM deciphering & Audius proxying).
 * Falls back to client-side Audius provider if offline or API is unreachable.
 * @param forceRefresh - if true, bypass server-side stream cache (used for stall recovery)
 */
export async function resolveStream(
  track: Track,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<StreamSource | null> {
  const providerName = track.provider;
  const providerTrackId = track.providerTrackId;

  // Primary: resolve via server-side Route Handler
  try {
    const url = `/api/stream/${encodeURIComponent(track.id)}${forceRefresh ? "?refresh=1" : ""}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.source?.url) {
        return data.source;
      }
    }
  } catch (err) {
    console.warn("[resolveStream] API resolver call failed:", err);
  }

  // Fallback for native client providers (e.g. Audius direct)
  const nativeProvider = providers.find((p) => p.name === providerName);
  if (nativeProvider && isSourceAvailable(`${providerName}:${providerTrackId}`)) {
    try {
      const source = await nativeProvider.getStream(providerTrackId);
      if (source) return source;
    } catch {
      markUnavailable(`${providerName}:${providerTrackId}`);
    }
  }

  return null;
}

export { providers };
