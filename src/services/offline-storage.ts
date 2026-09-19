"use client";

import type { Track } from "@/types/music";

export interface OfflineTrackRecord {
  id: string;
  track: Track;
  blob: Blob;
  size: number;
  mimeType: string;
  downloadedAt: number;
}

export interface OfflineTrackSummary {
  id: string;
  track: Track;
  size: number;
  downloadedAt: number;
}

const DB_NAME = "cloudbeats_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryUrlCache = new Map<string, string>();
const offlineTrackIds = new Set<string>();
let isInitialized = false;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not supported"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("downloadedAt", "downloadedAt", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

/**
 * Initialize offline storage cache into memory for instant synchronous checks.
 */
export async function initOfflineStorage(): Promise<void> {
  if (isInitialized || typeof window === "undefined") return;
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const keys = request.result as string[];
        offlineTrackIds.clear();
        keys.forEach((k) => offlineTrackIds.add(k));
        isInitialized = true;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    // Background pre-warm object URLs so playback of offline tracks is 100% synchronous
    const allRecordsReq = (await getDB()).transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    allRecordsReq.onsuccess = () => {
      const records = (allRecordsReq.result || []) as OfflineTrackRecord[];
      records.forEach((rec) => {
        if (!memoryUrlCache.has(rec.id) && rec.blob) {
          memoryUrlCache.set(rec.id, URL.createObjectURL(rec.blob));
        }
      });
    };
  } catch (err) {
    console.warn("[OfflineStorage] Failed to initialize:", err);
  }
}

/**
 * Fast synchronous check if a track is in the offline bucket.
 */
export function isTrackOffline(trackId: string): boolean {
  return offlineTrackIds.has(trackId);
}

/**
 * Synchronously get pre-warmed Object URL if track is offline and cached in memory.
 */
export function getSyncOfflineTrackUrl(trackId: string): string | null {
  return memoryUrlCache.get(trackId) || null;
}

/**
 * Get an active Object URL for a downloaded track.
 */
export async function getOfflineTrackUrl(trackId: string): Promise<string | null> {
  if (!offlineTrackIds.has(trackId)) return null;

  const cached = memoryUrlCache.get(trackId);
  if (cached) return cached;

  const blob = await getOfflineTrackBlob(trackId);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  memoryUrlCache.set(trackId, url);
  return url;
}

/**
 * Fetch track audio blob from IndexedDB.
 */
export async function getOfflineTrackBlob(trackId: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(trackId);

    return new Promise<Blob | null>((resolve, reject) => {
      request.onsuccess = () => {
        const record = request.result as OfflineTrackRecord | undefined;
        resolve(record ? record.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Download a track audio stream and save it into the offline bucket.
 */
export async function saveTrackOffline(
  track: Track,
  onProgress?: (receivedBytes: number, totalBytes: number) => void
): Promise<void> {
  if (typeof window === "undefined") return;

  const streamUrl = `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
  let blob: Blob;

  try {
    // 1. Probe total size and content-type using Range bytes=0-0 to bypass YouTube throttling
    const probeRes = await fetch(streamUrl, {
      headers: { Range: "bytes=0-0" },
    });

    if (!probeRes.ok && probeRes.status !== 206) {
      throw new Error(`Gagal mengunduh audio: status ${probeRes.status}`);
    }

    const contentRange = probeRes.headers.get("content-range");
    const contentType = probeRes.headers.get("content-type") || "audio/mp4";
    const totalBytes = contentRange ? parseInt(contentRange.split("/")[1] || "0", 10) : 0;

    if (totalBytes > 0) {
      // Chunked range download: Bypasses YouTube content pacing (116s -> 0.7s)
      const chunkSize = 1024 * 1024; // 1MB chunks
      const chunks: BlobPart[] = [];
      let downloadedBytes = 0;

      for (let start = 0; start < totalBytes; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, totalBytes - 1);
        const chunkRes = await fetch(streamUrl, {
          headers: { Range: `bytes=${start}-${end}` },
        });

        if (!chunkRes.ok && chunkRes.status !== 206) {
          throw new Error(`Gagal mengunduh bagian lagu: status ${chunkRes.status}`);
        }

        const buffer = await chunkRes.arrayBuffer();
        chunks.push(buffer);
        downloadedBytes += buffer.byteLength;

        if (onProgress) {
          onProgress(downloadedBytes, totalBytes);
        }
      }

      blob = new Blob(chunks, { type: contentType });
    } else {
      // Fallback: direct blob fetch
      const directRes = await fetch(streamUrl);
      if (!directRes.ok) {
        throw new Error(`Gagal mengunduh audio: status ${directRes.status}`);
      }
      blob = await directRes.blob();
    }
  } catch (err) {
    console.error("[saveTrackOffline] error:", err);
    throw new Error("Gagal membaca data audio stream");
  }

  const cleanTrack: Track = {
    id: String(track.id),
    title: String(track.title || "Unknown Title"),
    artist: String(track.artist || "Unknown Artist"),
    album: track.album ? String(track.album) : undefined,
    albumId: track.albumId ? String(track.albumId) : undefined,
    artworkUrl: track.artworkUrl ? String(track.artworkUrl) : undefined,
    duration: typeof track.duration === "number" ? track.duration : 0,
    provider: track.provider || "ytm",
    providerTrackId: String(track.providerTrackId || track.id),
    availability: track.availability || "PLAYABLE",
  };

  const record: OfflineTrackRecord = {
    id: track.id,
    track: cleanTrack,
    blob,
    size: blob.size,
    mimeType: blob.type || "audio/mp4",
    downloadedAt: Date.now(),
  };

  const db = await getDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      offlineTrackIds.add(track.id);
      // Create and cache object url
      const url = URL.createObjectURL(blob);
      memoryUrlCache.set(track.id, url);
      notifyStorageUpdated();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Remove a track from the offline bucket.
 */
export async function removeTrackOffline(trackId: string): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(trackId);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        offlineTrackIds.delete(trackId);
        const url = memoryUrlCache.get(trackId);
        if (url) {
          URL.revokeObjectURL(url);
          memoryUrlCache.delete(trackId);
        }
        notifyStorageUpdated();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] Remove failed:", err);
  }
}

/**
 * Get all offline track summaries in the bucket.
 */
export async function getAllOfflineTracks(): Promise<OfflineTrackSummary[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise<OfflineTrackSummary[]>((resolve, reject) => {
      request.onsuccess = () => {
        const records = (request.result || []) as OfflineTrackRecord[];
        const summaries: OfflineTrackSummary[] = records
          .map((r) => ({
            id: r.id,
            track: r.track,
            size: r.size,
            downloadedAt: r.downloadedAt,
          }))
          .sort((a, b) => b.downloadedAt - a.downloadedAt);
        resolve(summaries);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Calculate total size of the offline bucket in bytes.
 */
export async function getOfflineStorageSize(): Promise<number> {
  const tracks = await getAllOfflineTracks();
  return tracks.reduce((acc, curr) => acc + (curr.size || 0), 0);
}

/**
 * Clear all tracks from the offline bucket.
 */
export async function clearAllOffline(): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => {
        offlineTrackIds.clear();
        memoryUrlCache.forEach((url) => URL.revokeObjectURL(url));
        memoryUrlCache.clear();
        notifyStorageUpdated();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("[OfflineStorage] Clear failed:", err);
  }
}

/**
 * Format bytes to human readable format (e.g. "42.5 MB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export const OFFLINE_STORAGE_EVENT = "cloudbeats:offline-storage-updated";

function notifyStorageUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_STORAGE_EVENT));
  }
}
