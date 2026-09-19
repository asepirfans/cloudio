import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Track } from "@/types/music";

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistState {
  playlists: Playlist[];
  createPlaylist: (name: string, description?: string) => Playlist;
  deletePlaylist: (playlistId: string) => void;
  updatePlaylist: (playlistId: string, name: string, description?: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => boolean;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  getPlaylist: (playlistId: string) => Playlist | undefined;
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],

      createPlaylist: (name: string, description?: string) => {
        const trimmed = name.trim() || "Playlist Baru";
        const newPlaylist: Playlist = {
          id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: trimmed,
          description: description?.trim(),
          tracks: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          playlists: [newPlaylist, ...state.playlists],
        }));

        return newPlaylist;
      },

      deletePlaylist: (playlistId: string) => {
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== playlistId),
        }));
      },

      updatePlaylist: (playlistId: string, name: string, description?: string) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              name: name.trim() || p.name,
              description: description !== undefined ? description.trim() : p.description,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      addTrackToPlaylist: (playlistId: string, track: Track) => {
        const playlist = get().playlists.find((p) => p.id === playlistId);
        if (!playlist) return false;

        const alreadyExists = playlist.tracks.some((t) => t.id === track.id);
        if (alreadyExists) return false;

        const updatedTracks = [...playlist.tracks, track];
        const coverArt = playlist.coverArt || track.artworkUrl;

        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              coverArt,
              tracks: updatedTracks,
              updatedAt: Date.now(),
            };
          }),
        }));

        return true;
      },

      removeTrackFromPlaylist: (playlistId: string, trackId: string) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const remainingTracks = p.tracks.filter((t) => t.id !== trackId);
            const coverArt = remainingTracks[0]?.artworkUrl;
            return {
              ...p,
              tracks: remainingTracks,
              coverArt,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      reorderTracks: (playlistId: string, fromIndex: number, toIndex: number) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const updated = [...p.tracks];
            const [moved] = updated.splice(fromIndex, 1);
            if (moved) {
              updated.splice(toIndex, 0, moved);
            }
            return {
              ...p,
              tracks: updated,
              coverArt: updated[0]?.artworkUrl,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      getPlaylist: (playlistId: string) => {
        return get().playlists.find((p) => p.id === playlistId);
      },
    }),
    {
      name: "cloudbeats_user_playlists",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
