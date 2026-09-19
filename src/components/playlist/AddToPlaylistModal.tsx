"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Plus, Check, ListMusic, X, FolderPlus } from "lucide-react";
import { usePlaylistStore, type Playlist } from "@/stores/playlist-store";
import { usePlayerStore } from "@/stores/player-store";
import type { Track } from "@/types/music";

interface AddToPlaylistModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AddToPlaylistModal({ track, isOpen, onClose }: AddToPlaylistModalProps) {
  const [mounted, setMounted] = useState(false);
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlaylistStore();
  const { showQueueToast } = usePlayerStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !track || !mounted) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newPlaylistName.trim()) return;

    const created = createPlaylist(newPlaylistName.trim());
    addTrackToPlaylist(created.id, track);
    showQueueToast("Playlist dibuat & lagu ditambahkan", created.name);
    setNewPlaylistName("");
    setIsCreating(false);
    onClose();
  };

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
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border p-5 flex flex-col max-h-[85vh] shadow-2xl"
        style={{
          backgroundColor: "#121216",
          borderColor: "rgba(255, 255, 255, 0.12)",
          color: "#ffffff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <FolderPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold">Simpan ke Playlist</h3>
              <p className="text-xs text-white/50 truncate max-w-[220px]">
                {track.title}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-fast cursor-pointer"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Inline Create Form */}
        {isCreating ? (
          <form onSubmit={handleCreate} className="pt-4 pb-2">
            <label className="text-xs font-medium text-white/70 block mb-1.5">
              Nama Playlist Baru
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Contoh: Senja Chill, Mood Pagi..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-sky-500/60 transition-fast"
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="px-4 py-2.5 bg-sky-400 hover:bg-sky-400 disabled:opacity-40 text-black font-semibold text-sm rounded-xl transition-fast shrink-0 cursor-pointer"
              >
                Buat
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreating(false);
                }}
                className="px-3 py-2.5 text-white/60 hover:text-white text-sm rounded-xl transition-fast shrink-0 cursor-pointer"
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
              setIsCreating(true);
            }}
            className="mt-4 flex items-center gap-3 px-3.5 py-3 rounded-xl border border-dashed border-white/20 hover:border-sky-500/50 hover:bg-sky-500/5 text-white/80 hover:text-white transition-fast group text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-white/5 group-hover:bg-sky-500/20 text-white/70 group-hover:text-sky-400 flex items-center justify-center transition-fast">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold">Buat Playlist Baru</div>
          </button>
        )}

        {/* Playlists List */}
        <div className="mt-4 overflow-y-auto space-y-1.5 flex-1 pr-1 max-h-[320px]">
          {playlists.length === 0 ? (
            <div className="py-8 text-center text-white/40 text-xs">
              Belum ada playlist. Buat playlist pertamamu di atas.
            </div>
          ) : (
            playlists.map((pl) => {
              const containsTrack = pl.tracks.some((t) => t.id === track.id);
              return (
                <button
                  key={pl.id}
                  onClick={(e) => handleSelectPlaylist(pl, e)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-fast text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center border border-white/10 relative">
                      {pl.coverArt ? (
                        <Image
                          src={pl.coverArt}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <ListMusic size={18} className="text-white/40" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-sky-400 truncate transition-fast">
                        {pl.name}
                      </p>
                      <p className="text-xs text-white/40">
                        {pl.tracks.length} lagu
                      </p>
                    </div>
                  </div>

                  {containsTrack ? (
                    <div className="flex items-center gap-1 text-sky-400 text-xs px-2 py-1 bg-sky-500/10 rounded-lg border border-sky-500/20">
                      <Check size={14} />
                      <span className="text-[11px] font-semibold">Tersimpan</span>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-fast text-white/60">
                      <Plus size={14} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
