"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Download,
  ListMusic,
  Plus,
  Play,
  Shuffle,
  Trash2,
  HardDrive,
  Music2,
  Search,
  ArrowLeft,
  X,
  WifiOff,
} from "lucide-react";
import { usePlaylistStore, type Playlist } from "@/stores/playlist-store";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackDirectly } from "@/player/audio-engine";
import { formatBytes } from "@/services/offline-storage";
import { TrackRow } from "@/components/track/TrackRow";
import type { Track } from "@/types/music";

type LibraryTab = "offline_bucket" | "playlists";

export function LibraryClient() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<LibraryTab>("offline_bucket");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [bucketSearchQuery, setBucketSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const { playlists, createPlaylist, deletePlaylist, removeTrackFromPlaylist } = usePlaylistStore();
  const {
    offlineTracks,
    totalSize,
    formattedSize,
    loading: loadingOffline,
    removeTrack: removeOfflineTrack,
    clearBucket,
  } = useOfflineStorage();
  const { showQueueToast } = usePlayerStore();

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return playlists.find((p) => p.id === selectedPlaylistId) || null;
  }, [playlists, selectedPlaylistId]);

  // Filtered offline tracks for search inside bucket
  const filteredOfflineTracks = useMemo(() => {
    if (!bucketSearchQuery.trim()) return offlineTracks;
    const q = bucketSearchQuery.toLowerCase().trim();
    return offlineTracks.filter(
      (item) =>
        item.track.title.toLowerCase().includes(q) ||
        item.track.artist.toLowerCase().includes(q)
    );
  }, [offlineTracks, bucketSearchQuery]);

  // Actions for Offline Bucket
  const handlePlayAllOffline = (shuffle = false) => {
    if (offlineTracks.length === 0) return;
    let tracks = offlineTracks.map((item) => item.track);
    if (shuffle) {
      tracks = [...tracks].sort(() => Math.random() - 0.5);
    }
    playTrackDirectly(tracks[0], {
      queue: tracks,
      index: 0,
    });
    showQueueToast(
      shuffle ? "Memutar acak lagu offline" : "Memutar seluruh lagu offline",
      `${tracks.length} Lagu`
    );
  };

  const handleClearBucket = () => {
    if (window.confirm("Apakah Anda yakin ingin mengosongkan seluruh lagu di bucket offline?")) {
      clearBucket();
      showQueueToast("Bucket offline telah dikosongkan");
    }
  };

  // Actions for Playlists
  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const created = createPlaylist(newPlaylistName.trim());
    showQueueToast("Playlist dibuat", created.name);
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
    setSelectedPlaylistId(created.id);
  };

  const handleDeletePlaylist = (playlist: Playlist) => {
    if (window.confirm(`Hapus playlist "${playlist.name}"?`)) {
      deletePlaylist(playlist.id);
      setSelectedPlaylistId(null);
      showQueueToast("Playlist dihapus", playlist.name);
    }
  };

  const handlePlayPlaylist = (playlist: Playlist, shuffle = false) => {
    if (playlist.tracks.length === 0) return;
    let tracks = playlist.tracks;
    if (shuffle) {
      tracks = [...tracks].sort(() => Math.random() - 0.5);
    }
    playTrackDirectly(tracks[0], {
      queue: tracks,
      index: 0,
    });
    showQueueToast(
      shuffle ? "Memutar acak playlist" : "Memutar playlist",
      playlist.name
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6 pb-24 overflow-x-hidden">
      {/* If viewing a single playlist */}
      {selectedPlaylist ? (
        <div className="space-y-5 animate-in fade-in duration-200">
          <button
            onClick={() => setSelectedPlaylistId(null)}
            className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-fast py-1 -ml-1 cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Semua Playlist</span>
          </button>

          {/* Playlist Detail Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 pb-4 border-b border-white/10">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 relative shadow-xl flex items-center justify-center">
              {selectedPlaylist.coverArt ? (
                <Image
                  src={selectedPlaylist.coverArt}
                  alt=""
                  width={144}
                  height={144}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <ListMusic size={40} className="text-white/20" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                Playlist Pribadi
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white mt-1.5 truncate">
                {selectedPlaylist.name}
              </h1>
              {selectedPlaylist.description && (
                <p className="text-xs text-white/50 mt-1 line-clamp-2">
                  {selectedPlaylist.description}
                </p>
              )}
              <p className="text-xs text-white/40 mt-2 flex items-center gap-2">
                <span>{selectedPlaylist.tracks.length} Lagu</span>
                <span>•</span>
                <span>Diperbarui {new Date(selectedPlaylist.updatedAt).toLocaleDateString("id-ID")}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePlayPlaylist(selectedPlaylist, false)}
                disabled={selectedPlaylist.tracks.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-sky-400 hover:bg-sky-400 disabled:opacity-40 text-black font-semibold text-xs transition-fast cursor-pointer shadow-lg shadow-sky-500/20"
              >
                <Play size={14} className="fill-black ml-0.5" />
                <span>Putar Semua</span>
              </button>

              <button
                onClick={() => handlePlayPlaylist(selectedPlaylist, true)}
                disabled={selectedPlaylist.tracks.length === 0}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white font-medium text-xs border border-white/10 transition-fast cursor-pointer"
              >
                <Shuffle size={14} />
                <span className="hidden sm:inline">Acak</span>
              </button>
            </div>

            <button
              onClick={() => handleDeletePlaylist(selectedPlaylist)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-fast cursor-pointer"
              title="Hapus Playlist"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Hapus Playlist</span>
            </button>
          </div>

          {/* Tracks list */}
          <div className="space-y-1 pt-2">
            {selectedPlaylist.tracks.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl p-6">
                <Music2 size={32} className="mx-auto text-white/20 mb-2" />
                <p className="text-sm text-white/70 font-medium">Playlist masih kosong</p>
                <p className="text-xs text-white/40 mt-1 max-w-xs mx-auto">
                  Cari lagu favoritmu dan tekan menu opsi titik tiga untuk memasukkannya ke playlist ini.
                </p>
              </div>
            ) : (
              selectedPlaylist.tracks.map((track, i) => (
                <div key={`${track.id}-${i}`} className="flex items-center gap-2 group">
                  <div className="flex-1 min-w-0">
                    <TrackRow
                      track={track}
                      index={i}
                      queue={selectedPlaylist.tracks}
                    />
                  </div>
                  <button
                    onClick={() => {
                      removeTrackFromPlaylist(selectedPlaylist.id, track.id);
                      showQueueToast("Lagu dihapus dari playlist", track.title);
                    }}
                    className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-fast opacity-0 group-hover:opacity-100 shrink-0"
                    title="Hapus dari playlist"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Main Library View with Tabs */
        <div className="space-y-5">
          {/* Spotify-style Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Koleksi Kamu
            </h1>
            <button
              onClick={() => {
                setNewPlaylistName(`Playlist Saya #${playlists.length + 1}`);
                setIsCreatingPlaylist(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-xs border border-white/10 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Plus size={15} />
              <span>Playlist Baru</span>
            </button>
          </div>

          {/* Spotify-style Segmented Pills */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("offline_bucket")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "offline_bucket"
                  ? "bg-white text-black font-bold shadow-md"
                  : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              }`}
            >
              <Download size={13} className={activeTab === "offline_bucket" ? "text-sky-600" : "text-sky-400"} />
              <span>Bucket Offline</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === "offline_bucket" ? "bg-black/10 text-black/80 font-bold" : "bg-white/10 text-white/70"}`}>
                {offlineTracks.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("playlists")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "playlists"
                  ? "bg-white text-black font-bold shadow-md"
                  : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              }`}
            >
              <ListMusic size={13} className={activeTab === "playlists" ? "text-sky-600" : "text-sky-400"} />
              <span>Playlist Saya</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === "playlists" ? "bg-black/10 text-black/80 font-bold" : "bg-white/10 text-white/70"}`}>
                {playlists.length}
              </span>
            </button>
          </div>

          {/* TAB 1: BUCKET OFFLINE */}
          {activeTab === "offline_bucket" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Bucket Status Card */}
              <div className="rounded-2xl p-4 bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                      <HardDrive size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Bucket Lagu Offline</h3>
                      <p className="text-[11px] text-white/50">
                        Disimpan di memori perangkat • 100% tanpa internet
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-sky-400">{formattedSize}</p>
                    <p className="text-[10px] text-white/40">{offlineTracks.length} Lagu</p>
                  </div>
                </div>

                {/* Quick Action Buttons for Bucket */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePlayAllOffline(false)}
                      disabled={offlineTracks.length === 0}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sky-400 hover:bg-sky-400 disabled:opacity-40 text-black font-semibold text-xs transition-fast cursor-pointer"
                    >
                      <Play size={12} className="fill-black ml-0.5" />
                      <span>Putar Bucket</span>
                    </button>

                    <button
                      onClick={() => handlePlayAllOffline(true)}
                      disabled={offlineTracks.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white font-medium text-xs border border-white/10 transition-fast cursor-pointer"
                    >
                      <Shuffle size={12} />
                      <span>Acak</span>
                    </button>
                  </div>

                  {offlineTracks.length > 0 && (
                    <button
                      onClick={handleClearBucket}
                      className="text-[11px] text-white/40 hover:text-red-400 transition-fast py-1 px-2 rounded-lg hover:bg-white/5"
                    >
                      Kosongkan Bucket
                    </button>
                  )}
                </div>
              </div>

              {/* Bucket Search Bar */}
              {offlineTracks.length > 3 && (
                <div className="relative flex items-center rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <Search size={14} className="text-white/40 shrink-0 mr-2" />
                  <input
                    type="text"
                    placeholder="Cari lagu di bucket offline..."
                    value={bucketSearchQuery}
                    onChange={(e) => setBucketSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs text-white placeholder-white/40 outline-none"
                  />
                  {bucketSearchQuery && (
                    <button
                      onClick={() => setBucketSearchQuery("")}
                      className="text-white/40 hover:text-white transition-fast ml-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Offline Song List */}
              <div className="space-y-1">
                {loadingOffline ? (
                  <div className="py-12 text-center text-xs text-white/40">
                    Memuat bucket offline...
                  </div>
                ) : offlineTracks.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl p-6">
                    <WifiOff size={32} className="mx-auto text-white/20 mb-2" />
                    <p className="text-sm text-white/70 font-medium">Bucket offline masih kosong</p>
                    <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                      Gunakan tombol titik tiga pada lagu manapun lalu pilih &ldquo;Simpan ke Bucket Offline&rdquo; untuk dapat memutarnya di mana saja tanpa kuota.
                    </p>
                  </div>
                ) : filteredOfflineTracks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/40">
                    Tidak ada lagu cocok dengan pencarian &ldquo;{bucketSearchQuery}&rdquo;
                  </div>
                ) : (
                  filteredOfflineTracks.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <div className="flex-1 min-w-0">
                        <TrackRow
                          track={item.track}
                          index={i}
                          queue={offlineTracks.map((t) => t.track)}
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pr-1">
                        <span className="text-[11px] text-white/40 font-mono hidden sm:inline">
                          {formatBytes(item.size)}
                        </span>
                        <button
                          onClick={() => {
                            removeOfflineTrack(item.id);
                            showQueueToast("Dihapus dari bucket offline", item.track.title);
                          }}
                          className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-fast opacity-0 group-hover:opacity-100"
                          title="Hapus dari bucket offline"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PLAYLIST SAYA */}
          {activeTab === "playlists" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Playlists Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {playlists.length === 0 ? (
                  <div className="col-span-full text-center py-20 px-6 border border-dashed border-white/10 rounded-2xl">
                    <ListMusic size={36} className="mx-auto text-white/20 mb-3" />
                    <p className="text-base font-semibold text-white">Belum ada playlist</p>
                    <p className="text-xs text-white/40 mt-1 max-w-xs mx-auto mb-5">
                      Buat playlist untuk menyimpan lagu-lagu favoritmu.
                    </p>
                    <button
                      onClick={() => {
                        setNewPlaylistName(`Playlist Saya #${playlists.length + 1}`);
                        setIsCreatingPlaylist(true);
                      }}
                      className="px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs hover:scale-105 transition-all cursor-pointer shadow-lg"
                    >
                      Buat Playlist
                    </button>
                  </div>
                ) : (
                  playlists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => setSelectedPlaylistId(pl.id)}
                      className="group flex items-center gap-3.5 p-2.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer select-none"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center relative shadow-md">
                        {pl.coverArt ? (
                          <Image
                            src={pl.coverArt}
                            alt=""
                            width={56}
                            height={56}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <ListMusic size={22} className="text-white/30" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white group-hover:text-sky-400 truncate transition-fast">
                          {pl.name}
                        </h4>
                        <p className="text-xs text-white/40 truncate mt-0.5">
                          Playlist • {pl.tracks.length} lagu
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPlaylist(pl, false);
                        }}
                        disabled={pl.tracks.length === 0}
                        className="w-9 h-9 rounded-full bg-white/10 group-hover:bg-sky-400 text-white group-hover:text-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30 shrink-0 cursor-pointer shadow-lg"
                        title="Putar Playlist"
                      >
                        <Play size={14} className="fill-current ml-0.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spotify-style "Beri nama playlist kamu" Modal */}
      {isCreatingPlaylist && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => {
            setIsCreatingPlaylist(false);
            setNewPlaylistName("");
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
            style={{
              backgroundColor: "#18181c",
              border: "1px solid rgba(255, 255, 255, 0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold tracking-tight text-white mb-6">
              Beri nama playlist-mu
            </h2>

            <form onSubmit={handleCreatePlaylistSubmit} className="w-full">
              <input
                type="text"
                autoFocus
                placeholder="Nama playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full text-center text-xl font-bold text-white bg-transparent border-b-2 border-white/20 focus:border-sky-400 pb-2 mb-8 outline-none transition-colors placeholder:text-white/30"
              />

              <div className="flex items-center justify-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingPlaylist(false);
                    setNewPlaylistName("");
                  }}
                  className="flex-1 py-3 rounded-full border border-white/20 text-white font-semibold text-sm hover:bg-white/10 transition-fast cursor-pointer active:scale-95"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="flex-1 py-3 rounded-full bg-sky-400 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-400 text-black font-bold text-sm transition-fast cursor-pointer shadow-lg shadow-sky-500/20 active:scale-95"
                >
                  Buat
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
