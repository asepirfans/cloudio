"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Play,
  ListPlus,
  ListOrdered,
  FolderPlus,
  Download,
  CheckCircle2,
  Trash2,
  ArrowDownToLine,
  Share2,
  X,
  Loader2,
  ArrowLeft,
  Plus,
  Check,
  ListMusic,
} from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { getOfflineTrackBlob } from "@/services/offline-storage";
import { usePlaylistStore, type Playlist } from "@/stores/playlist-store";
import type { Track } from "@/types/music";

interface TrackActionsModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
}

type ModalView = "actions" | "playlist_picker";

export function TrackActionsModal({ track, isOpen, onClose }: TrackActionsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [currentView, setCurrentView] = useState<ModalView>("actions");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const { playNext, addToQueue, showQueueToast } = usePlayerStore();
  const {
    checkIsOffline,
    downloadTrack,
    removeTrack,
    downloadingIds,
  } = useOfflineStorage();
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlaylistStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset view to actions when reopened
  useEffect(() => {
    if (isOpen) {
      setCurrentView("actions");
      setIsCreatingPlaylist(false);
      setNewPlaylistName("");
    }
  }, [isOpen]);

  if (!isOpen || !track || !mounted) return null;

  const isOffline = checkIsOffline(track.id);
  const isDownloading = downloadingIds[track.id] !== undefined;

  const handlePlayNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTrackDirectly(track, { useSmartQueue: true });
    onClose();
  };

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    playNext(track);
    showQueueToast("Diputar berikutnya dalam antrean", track.title);
    onClose();
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(track);
    showQueueToast("Ditambahkan ke antrean aktif", track.title);
    onClose();
  };

  const handleToggleOffline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;

    if (isOffline) {
      onClose();
      try {
        await removeTrack(track.id);
        showQueueToast("Dihapus dari bucket offline", track.title);
      } catch {
        showQueueToast("Gagal menghapus lagu dari offline", track.title);
      }
    } else {
      // Immediate feedback and close modal so user is not blocked
      showQueueToast("Mengunduh lagu ke bucket offline...", track.title);
      onClose();
      try {
        await downloadTrack(track);
        showQueueToast("Tersimpan di bucket offline", track.title);
      } catch (err) {
        console.error("[Offline Download Error]:", err);
        showQueueToast("Gagal mengunduh lagu untuk offline", track.title);
      }
    }
  };

  const handleDownloadFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    showQueueToast("Menyiapkan file audio...", track.title);
    onClose();

    try {
      let blob = await getOfflineTrackBlob(track.id);
      if (!blob) {
        const downloadUrl = `/api/stream/${encodeURIComponent(track.id)}?audio=true`;
        const res = await fetch(downloadUrl, { headers: { Range: "bytes=0-" } });
        blob = await res.blob();
      }

      const mime = (blob.type || "").toLowerCase();
      let ext = "m4a";
      if (mime.includes("webm")) {
        ext = "webm";
      } else if (mime.includes("ogg") || mime.includes("opus")) {
        ext = "opus";
      } else if (mime.includes("mp3") || mime.includes("mpeg")) {
        ext = "mp3";
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${track.artist} - ${track.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
      showQueueToast("File audio siap diunduh", track.title);
    } catch (err) {
      console.error("[handleDownloadFile] error:", err);
      showQueueToast("Gagal mengunduh file audio", track.title);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/track/${encodeURIComponent(track.id)}`;
    const shareText = `${track.title} oleh ${track.artist} di Cloudio`;

    let shared = false;

    // 1. Try Web Share API (native share sheet on mobile / secure context)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${track.title} - ${track.artist}`,
          text: shareText,
          url: shareUrl,
        });
        shared = true;
      } catch (err: any) {
        // If user explicitly cancelled/dismissed native sheet, do not copy to clipboard
        if (err?.name === "AbortError") {
          onClose();
          return;
        }
      }
    }

    // 2. If Web Share was not used or unavailable (e.g. desktop, HTTP over LAN), copy to clipboard
    if (!shared) {
      let copied = false;

      // Modern Clipboard API
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        } catch {}
      }

      // Legacy fallback for non-secure HTTP (e.g. 192.168.x.x network testing)
      if (!copied && typeof document !== "undefined") {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = shareUrl;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.style.top = "0";
          textarea.setAttribute("readonly", "");
          document.body.appendChild(textarea);
          textarea.select();
          textarea.setSelectionRange(0, 99999);
          copied = document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch {}
      }

      showQueueToast("Tautan lagu disalin ke clipboard", track.title);
    }

    onClose();
  };

  // Playlist handlers
  const handleSelectPlaylist = (playlist: Playlist, e: React.MouseEvent) => {
    e.stopPropagation();
    const added = addTrackToPlaylist(playlist.id, track);
    if (added) {
      showQueueToast("Ditambahkan ke playlist", playlist.name);
    } else {
      showQueueToast("Lagu sudah ada di playlist ini", playlist.name);
    }
    onClose();
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newPlaylistName.trim()) return;

    const created = createPlaylist(newPlaylistName.trim());
    addTrackToPlaylist(created.id, track);
    showQueueToast("Playlist dibuat & lagu ditambahkan", created.name);
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border p-4 shadow-2xl flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: "#121216",
          borderColor: "rgba(255, 255, 255, 0.12)",
          color: "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* VIEW 1: ACTIONS MENU */}
        {currentView === "actions" && (
          <>
            {/* Header Track Info */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/10 relative">
                  {track.artworkUrl ? (
                    <Image
                      src={track.artworkUrl}
                      alt=""
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate text-white">
                    {track.title}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    {track.artist}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-fast shrink-0 cursor-pointer"
                aria-label="Tutup menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Action List */}
            <div className="py-2 space-y-1">
              <button
                onClick={handlePlayNow}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <Play size={18} className="text-sky-400 shrink-0" />
                <div className="text-sm font-medium">Putar Sekarang</div>
              </button>

              <button
                onClick={handlePlayNext}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <ListPlus size={18} className="text-white/70 shrink-0" />
                <div className="text-sm font-medium">Putar Berikutnya</div>
              </button>

              <button
                onClick={handleAddToQueue}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <ListOrdered size={18} className="text-white/70 shrink-0" />
                <div className="text-sm font-medium">Tambah ke Antrean</div>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentView("playlist_picker");
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <FolderPlus size={18} className="text-white/70 shrink-0" />
                <div className="text-sm font-medium">Simpan ke Playlist...</div>
              </button>

              {/* Offline Bucket action */}
              <button
                onClick={handleToggleOffline}
                disabled={isDownloading}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  {isDownloading ? (
                    <Loader2 size={18} className="text-sky-400 animate-spin shrink-0" />
                  ) : isOffline ? (
                    <CheckCircle2 size={18} className="text-sky-400 shrink-0" />
                  ) : (
                    <Download size={18} className="text-white/70 shrink-0" />
                  )}
                  <div className="text-sm font-medium">
                    {isDownloading
                      ? "Mengunduh ke bucket offline..."
                      : isOffline
                      ? "Tersimpan di Bucket Offline"
                      : "Simpan ke Bucket Offline"}
                  </div>
                </div>
                {isOffline && !isDownloading && (
                  <span className="text-[11px] text-red-400 hover:underline">Hapus</span>
                )}
              </button>

              {/* Direct audio download */}
              <button
                onClick={handleDownloadFile}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <ArrowDownToLine size={18} className="text-white/70 shrink-0" />
                <div className="text-sm font-medium">Unduh File Audio (.m4a)</div>
              </button>

              <button
                onClick={handleShare}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-white transition-fast text-left cursor-pointer"
              >
                <Share2 size={18} className="text-white/70 shrink-0" />
                <div className="text-sm font-medium">Bagikan Lagu</div>
              </button>
            </div>
          </>
        )}

        {/* VIEW 2: PLAYLIST PICKER (Seamless internal navigation) */}
        {currentView === "playlist_picker" && (
          <div className="flex flex-col flex-1 min-h-0 animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentView("actions");
                }}
                className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-fast cursor-pointer -ml-1 py-1"
              >
                <ArrowLeft size={16} />
                <span>Kembali</span>
              </button>
              <h3 className="text-sm font-semibold text-white">Pilih Playlist</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-fast cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Create Playlist Form or Button */}
            {isCreatingPlaylist ? (
              <form onSubmit={handleCreatePlaylistSubmit} className="pt-3 pb-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nama playlist..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-sky-400 transition-fast"
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistName.trim()}
                    className="px-4 py-2 bg-sky-400 hover:bg-sky-400 disabled:opacity-40 text-black font-bold text-xs rounded-full transition-fast shrink-0 cursor-pointer shadow-sm active:scale-95"
                  >
                    Buat
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCreatingPlaylist(false);
                    }}
                    className="px-3 py-2 text-white/60 hover:text-white text-xs rounded-full transition-fast shrink-0 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreatingPlaylist(true);
                }}
                className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-sky-500/50 hover:bg-sky-500/5 text-white/80 hover:text-white transition-fast group text-left cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-white/5 group-hover:bg-sky-500/20 text-white/70 group-hover:text-sky-400 flex items-center justify-center transition-fast">
                  <Plus size={16} />
                </div>
                <div className="text-xs font-semibold">Buat Playlist Baru</div>
              </button>
            )}

            {/* Playlists List */}
            <div className="mt-3 overflow-y-auto space-y-1 flex-1 pr-1 max-h-[260px]">
              {playlists.length === 0 ? (
                <div className="py-8 text-center text-white/40 text-xs">
                  Belum ada playlist. Buat playlist baru di atas.
                </div>
              ) : (
                playlists.map((pl) => {
                  const containsTrack = pl.tracks.some((t) => t.id === track.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={(e) => handleSelectPlaylist(pl, e)}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-fast text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center border border-white/10 relative">
                          {pl.coverArt ? (
                            <Image
                              src={pl.coverArt}
                              alt=""
                              width={36}
                              height={36}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <ListMusic size={16} className="text-white/40" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white group-hover:text-sky-400 truncate transition-fast">
                            {pl.name}
                          </p>
                          <p className="text-[10px] text-white/40">
                            {pl.tracks.length} lagu
                          </p>
                        </div>
                      </div>

                      {containsTrack ? (
                        <div className="flex items-center gap-1 text-sky-400 text-[10px] px-2 py-0.5 bg-sky-500/10 rounded-lg border border-sky-500/20">
                          <Check size={12} />
                          <span>Tersimpan</span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-fast text-white/60">
                          <Plus size={12} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
