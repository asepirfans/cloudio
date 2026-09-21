import type { Track } from "@/types/music";
import { isTrackOffline } from "@/services/offline-storage";
import { audioLogger } from "./logger";

const resolvedDurations = new Map<string, { duration: number; at: number }>();

export function rememberResolvedDuration(id: string, duration: unknown) {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return;
  resolvedDurations.delete(id);
  resolvedDurations.set(id, { duration, at: Date.now() });
  if (resolvedDurations.size > 32) resolvedDurations.delete(resolvedDurations.keys().next().value!);
}

export function getResolvedDuration(id: string): number | null {
  const cached = resolvedDurations.get(id);
  return cached && Date.now() - cached.at < 5 * 60 * 1000 ? cached.duration : null;
}

const WARM_TTL_MS = 5 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 15000;
const MAX_PREPARED_BYTES = 24 * 1024 * 1024;
const PREPARED_CHUNK_BYTES = 1024 * 1024;
const retainedIds = new Set<string>();
const warmed = new Map<string, number>();
const preparedUrls = new Map<string, { url: string; at: number }>();
const failed = new Map<string, number>();
type PendingPreparation = {
  controller: AbortController;
  promise: Promise<boolean>;
  wantPrefix: boolean;
};
const pending = new Map<string, PendingPreparation>();

export function retainPreparedTracks(ids: string[]) {
  retainedIds.clear();
  for (const id of ids) if (id) retainedIds.add(id);
  for (const [id, preparation] of pending) {
    if (!retainedIds.has(id)) preparation.controller.abort();
  }
  for (const [id, prepared] of preparedUrls) {
    if (!retainedIds.has(id)) {
      URL.revokeObjectURL(prepared.url);
      preparedUrls.delete(id);
    }
  }
  prune(warmed, WARM_TTL_MS);
  prune(failed, FAILURE_COOLDOWN_MS);
}

export function getPreparedTrackUrl(id: string): string | null {
  const prepared = preparedUrls.get(id);
  if (!prepared || Date.now() - prepared.at >= WARM_TTL_MS) {
    if (prepared) URL.revokeObjectURL(prepared.url);
    preparedUrls.delete(id);
    return null;
  }
  return prepared.url;
}

export function prewarmNextTrack(track: Track): Promise<boolean> {
  return startPreparation(track, true);
}

export function prewarmTrackMetadata(track: Track): Promise<boolean> {
  return startPreparation(track, false);
}

function startPreparation(track: Track, wantPrefix: boolean): Promise<boolean> {
  if (!track?.id || !retainedIds.has(track.id)) return Promise.resolve(false);
  if (isTrackOffline(track.id)) return Promise.resolve(true);
  if (wantPrefix && getPreparedTrackUrl(track.id)) return Promise.resolve(true);
  if (!wantPrefix && getResolvedDuration(track.id)) return Promise.resolve(true);
  const existing = pending.get(track.id);
  if (existing && !existing.controller.signal.aborted) {
    if (wantPrefix) existing.wantPrefix = true;
    return existing.promise;
  }
  const failedAt = failed.get(track.id);
  if (failedAt && Date.now() - failedAt < FAILURE_COOLDOWN_MS) return Promise.resolve(false);
  const controller = new AbortController();
  const preparation: PendingPreparation = { controller, promise: Promise.resolve(false), wantPrefix };
  const promise = prepare(track, preparation);
  preparation.promise = promise;
  pending.set(track.id, preparation);
  return promise;
}

async function prepare(track: Track, preparation: PendingPreparation): Promise<boolean> {
  const { controller } = preparation;
  // Resolve (12s server budget) + prefix (35s server opening budget), with margin.
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    audioLogger.log("prewarm.start", { trackId: track.id });
    const resolved = await fetch(`/api/resolve/${encodeURIComponent(track.id)}`, {
      method: "POST", signal: controller.signal, cache: "no-store",
    });
    if (!resolved.ok) throw new Error(`Resolve HTTP ${resolved.status}`);
    const data = await resolved.json();
    if (data.status !== "warmed") throw new Error("Resolver did not confirm warm state");
    rememberResolvedDuration(track.id, data.duration);
    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;
    if (!preparation.wantPrefix) {
      failed.delete(track.id);
      audioLogger.log("prewarm.resolved", { trackId: track.id });
      return true;
    }

    // Full responses from YouTube are content-paced and can take the duration of
    // the song to finish. Same-origin range chunks bypass that pacing, as used by
    // the proven offline downloader, while keeping this buffer memory-only.
    const url = `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
    const probe = await fetch(url, {
      headers: { Range: "bytes=0-0" }, signal: controller.signal, cache: "no-store",
    });
    const range = /^bytes 0-0\/(\d+)$/.exec(probe.headers.get("content-range") || "");
    const totalBytes = range ? Number(range[1]) : 0;
    const type = probe.headers.get("content-type") || "";
    await probe.body?.cancel();
    if (probe.status !== 206 || !totalBytes || totalBytes > MAX_PREPARED_BYTES || !/^(audio\/|video\/mp4|application\/octet-stream)/.test(type)) {
      throw new Error("Invalid or oversized prepared audio probe");
    }
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    for (let start = 0; start < totalBytes; start += PREPARED_CHUNK_BYTES) {
      const end = Math.min(start + PREPARED_CHUNK_BYTES - 1, totalBytes - 1);
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` }, signal: controller.signal, cache: "no-store",
      });
      const chunkRange = response.headers.get("content-range") || "";
      if (response.status !== 206 || chunkRange !== `bytes ${start}-${end}/${totalBytes}`) {
        await response.body?.cancel();
        throw new Error(`Invalid prepared audio range ${start}-${end}`);
      }
      const chunk = await response.arrayBuffer();
      if (chunk.byteLength !== end - start + 1) throw new Error("Truncated prepared audio chunk");
      chunks.push(chunk);
      received += chunk.byteLength;
    }
    if (received !== totalBytes) throw new Error("Truncated prepared audio");
    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;
    const previous = preparedUrls.get(track.id);
    if (previous) URL.revokeObjectURL(previous.url);
    const preparedUrl = URL.createObjectURL(new Blob(chunks, { type }));
    preparedUrls.set(track.id, { url: preparedUrl, at: Date.now() });
    warmed.set(track.id, Date.now());
    failed.delete(track.id);
    audioLogger.log("prewarm.ready", { trackId: track.id, bytes: received });
    return true;
  } catch (error) {
    if (!controller.signal.aborted && retainedIds.has(track.id)) {
      failed.set(track.id, Date.now());
      audioLogger.warn("prewarm.failed", { trackId: track.id }, error);
    }
    return false;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (pending.get(track.id)?.controller === controller) pending.delete(track.id);
  }
}

function prune(entries: Map<string, number>, ttl: number) {
  const now = Date.now();
  for (const [id, at] of entries) if (now - at >= ttl) entries.delete(id);
  while (entries.size > 32) entries.delete(entries.keys().next().value!);
}
