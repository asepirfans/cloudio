"use client";

import { useState, useEffect, useCallback } from "react";
import type { Track } from "@/types/music";
import {
  initOfflineStorage,
  isTrackOffline,
  saveTrackOffline,
  removeTrackOffline,
  getAllOfflineTracks,
  getOfflineStorageSize,
  clearAllOffline,
  formatBytes,
  OFFLINE_STORAGE_EVENT,
  type OfflineTrackSummary,
} from "@/services/offline-storage";

export function useOfflineStorage() {
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackSummary[]>([]);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      await initOfflineStorage();
      const [tracks, size] = await Promise.all([
        getAllOfflineTracks(),
        getOfflineStorageSize(),
      ]);
      setOfflineTracks(tracks);
      setTotalSize(size);
    } catch (err) {
      console.warn("[useOfflineStorage] refresh error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const handleUpdate = () => {
      refresh();
    };

    window.addEventListener(OFFLINE_STORAGE_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(OFFLINE_STORAGE_EVENT, handleUpdate);
    };
  }, [refresh]);

  const downloadTrack = useCallback(async (track: Track) => {
    setDownloadingIds((prev) => ({ ...prev, [track.id]: 0 }));
    try {
      await saveTrackOffline(track, (received, total) => {
        const pct = total > 0 ? Math.round((received / total) * 100) : 50;
        setDownloadingIds((prev) => ({ ...prev, [track.id]: pct }));
      });
      await refresh();
      return true;
    } catch (err) {
      console.error("[useOfflineStorage] Download failed:", err);
      throw err;
    } finally {
      setDownloadingIds((prev) => {
        const next = { ...prev };
        delete next[track.id];
        return next;
      });
    }
  }, [refresh]);

  const removeTrack = useCallback(async (trackId: string) => {
    await removeTrackOffline(trackId);
    await refresh();
  }, [refresh]);

  const clearBucket = useCallback(async () => {
    await clearAllOffline();
    await refresh();
  }, [refresh]);

  const checkIsOffline = useCallback((trackId: string) => {
    return isTrackOffline(trackId);
  }, []);

  return {
    offlineTracks,
    totalSize,
    formattedSize: formatBytes(totalSize),
    loading,
    downloadingIds,
    downloadTrack,
    removeTrack,
    clearBucket,
    checkIsOffline,
    refresh,
  };
}
