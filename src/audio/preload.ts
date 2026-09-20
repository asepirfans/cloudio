import type { Track } from "@/types/music";
import { isTrackOffline } from "@/services/offline-storage";
import { audioLogger } from "./logger";

// Set of warmed track IDs with timestamp
const warmedTracks = new Map<string, number>();
const WARM_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Pre-warms the backend resolver and stream cache for the upcoming track.
 * Does NOT download the entire song to RAM Blob.
 * Only makes a lightweight Range request or resolver pre-warm request so
 * upstream CDN URLs and the first audio chunks are warm in server memory.
 */
export async function prewarmNextTrack(track: Track): Promise<boolean> {
  if (!track || !track.id) return false;

  // If already offline in IndexedDB, playback is instantaneous anyway
  if (isTrackOffline(track.id)) {
    audioLogger.log(`Next track is already available offline: ${track.id}`);
    return true;
  }

  const now = Date.now();
  const lastWarmed = warmedTracks.get(track.id);
  if (lastWarmed && now - lastWarmed < WARM_EXPIRATION_MS) {
    return true; // Already warm
  }

  audioLogger.log(`Preparing next track: ${track.id} (${track.title})`);

  try {
    const parts = track.id.split(":");
    const providerTrackId = parts.length > 1 ? parts.slice(1).join(":") : track.id;
    const resolverUrl = (process.env.NEXT_PUBLIC_RESOLVER_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");

    // Directly prime the resolver cache in background (20s timeout so pytubefix has time to finish)
    const directPromise = fetch(`${resolverUrl}/resolve?id=${encodeURIComponent(providerTrackId)}`, {
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);

    // Also prime through Next.js proxy route
    const proxyPromise = fetch(`/api/resolve/${encodeURIComponent(track.id)}`, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);

    await Promise.race([directPromise, proxyPromise]);

    // Pre-buffer first 256 KB of audio stream to prime upstream CDN connection and browser cache
    try {
      const streamRes = await fetch(`${resolverUrl}/stream?id=${encodeURIComponent(providerTrackId)}`, {
        headers: { Range: "bytes=0-262143" },
        signal: AbortSignal.timeout(10000),
      });
      if (streamRes && (streamRes.status === 200 || streamRes.status === 206)) {
        await streamRes.arrayBuffer();
        audioLogger.log(`Pre-buffered first audio chunk for: ${track.id}`);
      }
    } catch (streamErr) {
      // Non-fatal if chunk prefetch times out; resolver cache is already warm
    }

    warmedTracks.set(track.id, now);
    audioLogger.log(`Next track prepared: ${track.id}`);
    return true;
  } catch (err: any) {
    audioLogger.warn(`Failed to prewarm next track: ${err?.message || err}`);
    return false;
  }
}

/**
 * Clean up warmed track entries older than WARM_EXPIRATION_MS
 */
export function purgeExpiredWarmedTracks() {
  const now = Date.now();
  for (const [id, ts] of warmedTracks.entries()) {
    if (now - ts > WARM_EXPIRATION_MS) {
      warmedTracks.delete(id);
    }
  }
}
