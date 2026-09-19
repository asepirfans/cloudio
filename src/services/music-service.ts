import { ytmProvider } from "@/music/ytm/provider";
import { audiusProvider } from "@/music/audius/provider";
import type { Track, AlbumDetail, ArtistDetail, SearchResults } from "@/types/music";

/**
 * Music Service — the only interface the UI touches.
 * Abstracts provider selection away from components.
 * Default provider: YouTube Music (complete catalog including Indonesian songs).
 * Fallback provider: Audius.
 */
export const musicService = {
  async search(query: string): Promise<SearchResults> {
    const results = await ytmProvider.searchAll(query);
    if (results.tracks.length > 0 || results.artists.length > 0 || (results.albums && results.albums.length > 0)) {
      return results;
    }
    // Fallback to Audius if YTM returns no tracks
    return audiusProvider.searchAll(query);
  },

  async getTrending(): Promise<Track[]> {
    const ytmTrending = await ytmProvider.getTrending?.();
    if (ytmTrending && ytmTrending.length > 0) {
      return ytmTrending;
    }
    return audiusProvider.getTrending?.() ?? [];
  },

  async getHomeSections(): Promise<{
    indonesianHits: Track[];
    globalHits: Track[];
    chillHits: Track[];
  }> {
    return ytmProvider.getHomeSections();
  },

  async getTrack(id: string): Promise<Track | null> {
    // id format: "provider:providerTrackId"
    const [provider, providerTrackId] = id.split(":");
    if (provider === "ytm") {
      return ytmProvider.getTrack(providerTrackId);
    }
    if (provider === "audius") {
      return audiusProvider.getTrack(providerTrackId);
    }
    return null;
  },

  async getArtistTracks(artistId: string): Promise<Track[]> {
    const [provider, providerArtistId] = artistId.split(":");
    if (provider === "ytm") {
      return ytmProvider.getArtistTracks?.(providerArtistId) ?? [];
    }
    if (provider === "audius") {
      return audiusProvider.getArtistTracks?.(providerArtistId) ?? [];
    }
    return [];
  },

  async getAlbum(albumId: string): Promise<AlbumDetail | null> {
    const [provider, providerAlbumId] = albumId.includes(":") ? albumId.split(":") : ["ytm", albumId];
    if (provider === "ytm") {
      return ytmProvider.getAlbum?.(providerAlbumId) ?? null;
    }
    return null;
  },

  async getArtist(artistId: string): Promise<ArtistDetail | null> {
    const [provider, providerArtistId] = artistId.includes(":") ? artistId.split(":") : ["ytm", artistId];
    if (provider === "ytm") {
      return ytmProvider.getArtist?.(providerArtistId) ?? null;
    }
    return null;
  },
};
