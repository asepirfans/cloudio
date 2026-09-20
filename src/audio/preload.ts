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
const PREFIX_BYTES = 512 * 1024;
const retainedIds = new Set<string>();
const warmed = new Map<string, number>();
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
  prune(warmed, WARM_TTL_MS);
  prune(failed, FAILURE_COOLDOWN_MS);
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
  const warmedAt = warmed.get(track.id);
  if (wantPrefix && warmedAt && Date.now() - warmedAt < WARM_TTL_MS) return Promise.resolve(true);
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
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
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

    const resolver = (process.env.NEXT_PUBLIC_RESOLVER_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");
    const url = track.provider === "ytm"
      ? `${resolver}/stream?id=${encodeURIComponent(track.providerTrackId)}`
      : `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` },
      signal: controller.signal, cache: "no-store",
    });
    // If Range is ignored, cancel without consuming a full song.
    if (response.status !== 206 || !response.body) {
      await response.body?.cancel();
      throw new Error(`Prefix requires HTTP 206 (got ${response.status})`);
    }
    const range = /^bytes 0-(\d+)\/(\d+|\*)$/.exec(response.headers.get("content-range") || "");
    const size = range ? Number(range[1]) + 1 : 0;
    const type = response.headers.get("content-type") || "";
    if (!size || size > PREFIX_BYTES || !/^(audio\/|video\/mp4|application\/octet-stream)/.test(type)) {
      await response.body.cancel();
      throw new Error("Invalid audio prefix response");
    }
    reader = response.body.getReader();
    let received = 0;
    while (received < size) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > size) throw new Error("Prefix exceeded declared range");
    }
    if (received !== size) throw new Error("Truncated audio prefix");
    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;
    warmed.set(track.id, Date.now());
    failed.delete(track.id);
    // This warms the resolver/upstream only. no-store means these bytes are not
    // a reusable HTMLAudioElement buffer, and we never retain a Blob.
    audioLogger.log("prewarm.warm", { trackId: track.id, bytes: received });
    return true;
  } catch (error) {
    if (!controller.signal.aborted && retainedIds.has(track.id)) {
      failed.set(track.id, Date.now());
      audioLogger.warn("prewarm.failed", { trackId: track.id }, error);
    }
    return false;
  } finally {
    clearTimeout(timeout);
    await reader?.cancel().catch(() => {});
    controller.abort();
    if (pending.get(track.id)?.controller === controller) pending.delete(track.id);
  }
}

function prune(entries: Map<string, number>, ttl: number) {
  const now = Date.now();
  for (const [id, at] of entries) if (now - at >= ttl) entries.delete(id);
  while (entries.size > 32) entries.delete(entries.keys().next().value!);
}
