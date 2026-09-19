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
    // 1. Try dedicated resolver endpoint first
    const resolveUrl = `/api/resolve/${encodeURIComponent(track.id)}`;
    const resolvePromise = fetch(resolveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);

    // 2. Also send lightweight 64KB range request to prime the edge CDN buffer
    const streamUrl = `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
    const streamPromise = fetch(streamUrl, {
      headers: {
        Range: "bytes=0-65535",
      },
      signal: AbortSignal.timeout(6000),
    })
      .then(async (res) => {
        if (res.body) {
          // Read first chunk and cancel reader so we do not download full song
          const reader = res.body.getReader();
          await reader.read().catch(() => {});
          await reader.cancel().catch(() => {});
        }
        return res.ok || res.status === 206;
      })
      .catch(() => false);

    await Promise.race([resolvePromise, streamPromise]);

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
