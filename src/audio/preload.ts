import type { Track } from "@/types/music";
import { isTrackOffline } from "@/services/offline-storage";
import { audioLogger } from "./logger";

// Keep only the playing track and its successor. A complete Blob avoids a new
// resolver/CDN request at the background track boundary; partial fetches cannot.
const prepared = new Map<string, string>();
let retainedIds = new Set<string>();
let pending: { id: string; controller: AbortController; promise: Promise<boolean> } | null = null;
const MAX_TRACK_BYTES = 25 * 1024 * 1024;

export function getPreparedTrackUrl(id: string): string | null {
  return prepared.get(id) ?? null;
}

export function retainPreparedTracks(ids: string[]) {
  retainedIds = new Set(ids);
  if (pending && !retainedIds.has(pending.id)) pending.controller.abort();
  for (const [id, url] of prepared) {
    if (!retainedIds.has(id)) {
      URL.revokeObjectURL(url);
      prepared.delete(id);
    }
  }
}

export function prewarmNextTrack(track: Track): Promise<boolean> {
  if (!track?.id) return Promise.resolve(false);
  if (isTrackOffline(track.id) || prepared.has(track.id)) return Promise.resolve(true);
  if (pending?.id === track.id && !pending.controller.signal.aborted) return pending.promise;
  pending?.controller.abort();
  const controller = new AbortController();
  const promise = prepare(track, controller);
  pending = { id: track.id, controller, promise };
  return promise;
}

async function prepare(track: Track, controller: AbortController): Promise<boolean> {
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const resolver = (process.env.NEXT_PUBLIC_RESOLVER_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");
    const url = track.provider === "ytm"
      ? `${resolver}/stream?id=${encodeURIComponent(track.providerTrackId)}`
      : `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
    const response = await fetch(url, { signal: controller.signal });
    // Never treat an error, empty body or partial response as a playable file.
    if (response.status !== 200 || !response.body) throw new Error("Incomplete audio response");
    const type = response.headers.get("content-type")?.split(";")[0] || "";
    if (!type.startsWith("audio/") && type !== "application/octet-stream" && type !== "video/mp4") {
      throw new Error("Unexpected audio content type");
    }
    const expectedSize = Number(response.headers.get("content-length")) || 0;
    if (expectedSize > MAX_TRACK_BYTES) throw new Error("Track exceeds preparation limit");
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TRACK_BYTES) throw new Error("Track exceeds preparation limit");
      chunks.push(value.slice().buffer);
    }
    if (!size || (expectedSize > 0 && size !== expectedSize)) throw new Error("Truncated audio");
    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;
    prepared.set(track.id, URL.createObjectURL(new Blob(chunks, { type })));
    audioLogger.log(`Prepared complete next track: ${track.id}`);
    return true;
  } catch (error) {
    controller.abort();
    audioLogger.warn(`Track preparation failed: ${track.id}`, error);
    return false;
  } finally {
    clearTimeout(timeout);
    if (pending?.controller === controller) pending = null;
  }
}
