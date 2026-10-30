import type { Track } from "@/types/music";
import { isTrackOffline } from "@/services/offline-storage";
import { audioLogger } from "./logger";
import { unmaskStreamUrl } from "./vault";

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
const retainedIds = new Set<string>();
const warmed = new Map<string, number>();
const preparedUrls = new Map<string, { url: string; at: number; expiresAt: number }>();
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
  const now = Date.now();
  for (const [id, prepared] of preparedUrls) {
    if (!retainedIds.has(id) || now >= prepared.expiresAt || now - prepared.at >= WARM_TTL_MS) {
      preparedUrls.delete(id);
    }
  }
  prune(warmed, WARM_TTL_MS);
  prune(failed, FAILURE_COOLDOWN_MS);
}

export function getPreparedTrackUrl(id: string): string | null {
  const prepared = preparedUrls.get(id);
  if (!prepared || Date.now() >= prepared.expiresAt || Date.now() - prepared.at >= WARM_TTL_MS) {
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
    if (data.status !== "warmed") {
      throw new Error("Resolver did not confirm warm state");
    }
    const resolvedUrl = data.ticket ? unmaskStreamUrl(data.ticket) : data.url;
    if (typeof resolvedUrl !== "string" || !resolvedUrl) {
      throw new Error("Resolver did not confirm warm state");
    }
    const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt * 1000 - 30000 : Date.now() + WARM_TTL_MS;
    rememberResolvedDuration(track.id, data.duration);
    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;

    preparedUrls.set(track.id, { url: resolvedUrl, at: Date.now(), expiresAt });
    if (!preparation.wantPrefix) {
      failed.delete(track.id);
      audioLogger.log("prewarm.resolved", { trackId: track.id });
      return true;
    }

    const probeUrl = data.ticket ? `/stream-vault/media/${data.ticket}.m4a` : resolvedUrl;
    const isYtm = track.provider === "ytm" || resolvedUrl.includes("/stream");
    if (isYtm) {
      const probe = await fetch(probeUrl, {
        headers: { Range: "bytes=0-65535" },
        signal: controller.signal,
        cache: "no-store",
      });
      const type = probe.headers.get("content-type") || "";
      await probe.body?.cancel();
      if (probe.status !== 206 || !/^(audio\/|video\/mp4|application\/octet-stream)/.test(type)) {
        preparedUrls.delete(track.id);
        failed.set(track.id, Date.now());
        throw new Error("Invalid prepared audio prefix probe");
      }
    } else {
      try {
        const probe = await fetch(data.url, {
          headers: { Range: "bytes=0-65535" },
          signal: controller.signal,
          cache: "no-store",
        });
        await probe.body?.cancel();
      } catch {
        // Non-fatal for third-party providers with strict CORS Range policies
      }
    }

    if (controller.signal.aborted || !retainedIds.has(track.id)) return false;
    warmed.set(track.id, Date.now());
    failed.delete(track.id);
    audioLogger.log("prewarm.ready", { trackId: track.id });
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

export async function getDirectStreamUrl(
  track: Pick<Track, "id"> & Partial<Pick<Track, "provider" | "providerTrackId">> | string,
  forceRefresh = false
): Promise<string> {
  const trackId = typeof track === "string" ? track : track.id;
  const parts = trackId.split(":");
  const provider = parts.length > 1 ? parts[0] : (typeof track === "object" && track.provider ? track.provider : "ytm");
  const providerTrackId = parts.length > 1 ? parts.slice(1).join(":") : (typeof track === "object" && track.providerTrackId ? track.providerTrackId : trackId);

  if (!forceRefresh) {
    const preparedUrl = getPreparedTrackUrl(trackId);
    if (preparedUrl) return preparedUrl;
  }

  const resolverBase = (process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.cloudiolabs.my.id").replace(/\/+$/, "");

  try {
    const res = await fetch(`/api/resolve/${encodeURIComponent(trackId)}${forceRefresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const resolvedUrl = data?.ticket ? unmaskStreamUrl(data.ticket) : data?.url;
      if (resolvedUrl) {
        const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt * 1000 - 30000 : Date.now() + WARM_TTL_MS;
        preparedUrls.set(trackId, { url: resolvedUrl, at: Date.now(), expiresAt });
        return resolvedUrl;
      }
    }
  } catch {}

  if (provider === "ytm") {
    return `${resolverBase}/stream?id=${encodeURIComponent(providerTrackId)}${forceRefresh ? "&refresh=1" : ""}`;
  }
  return `/api/stream/${encodeURIComponent(trackId)}?audio=true${forceRefresh ? "&refresh=1" : ""}`;
}
