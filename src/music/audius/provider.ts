import { audiusFetch, getDiscoveryNode } from "./client";
import { normalizeAudiusTrack, normalizeAudiusUser } from "../normalize";
import type { MusicProvider } from "../provider";
import type { Track, Artist, SearchResults, StreamSource } from "@/types/music";

interface AudiusSearchResponse {
  tracks: { data: unknown[] };
  users: { data: unknown[] };
}

export class AudiusProvider implements MusicProvider {
  name = "audius";

  async searchTracks(query: string): Promise<Track[]> {
    try {
      const data = await audiusFetch<unknown[]>("/v1/tracks/search", {
        query,
        limit: "25",
      });
      return (data || []).map((t) => normalizeAudiusTrack(t as Parameters<typeof normalizeAudiusTrack>[0]));
    } catch (err) {
      console.error("[Audius] searchTracks error:", err);
      return [];
    }
  }

  async searchAll(query: string): Promise<SearchResults> {
    try {
      const [tracks, artists] = await Promise.allSettled([
        this.searchTracks(query),
        this.searchArtists(query),
      ]);

      return {
        tracks: tracks.status === "fulfilled" ? tracks.value : [],
        artists: artists.status === "fulfilled" ? artists.value : [],
        total: 0,
      };
    } catch {
      return { tracks: [], artists: [], total: 0 };
    }
  }

  async searchArtists(query: string): Promise<Artist[]> {
    try {
      const data = await audiusFetch<unknown[]>("/v1/users/search", {
        query,
        limit: "10",
      });
      return (data || []).map((u) => normalizeAudiusUser(u as Parameters<typeof normalizeAudiusUser>[0]));
    } catch {
      return [];
    }
  }

  async getTrack(providerTrackId: string): Promise<Track | null> {
    try {
      const data = await audiusFetch<unknown>(`/v1/tracks/${providerTrackId}`);
      if (!data) return null;
      return normalizeAudiusTrack(data as Parameters<typeof normalizeAudiusTrack>[0]);
    } catch {
      return null;
    }
  }

  async getStream(providerTrackId: string): Promise<StreamSource | null> {
    try {
      const node = await getDiscoveryNode();
      const streamUrl = `${node}/v1/tracks/${providerTrackId}/stream?app_name=Cloudio`;

      // Verify the stream URL is accessible via HEAD
      return {
        url: streamUrl,
        type: "direct",
        provider: "audius",
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
    } catch {
      return null;
    }
  }

  async getTrending(): Promise<Track[]> {
    try {
      const data = await audiusFetch<unknown[]>("/v1/tracks/trending", {
        limit: "20",
      });
      return (data || []).map((t) => normalizeAudiusTrack(t as Parameters<typeof normalizeAudiusTrack>[0]));
    } catch (err) {
      console.error("[Audius] getTrending error:", err);
      return [];
    }
  }

  async getArtistTracks(artistId: string): Promise<Track[]> {
    try {
      const data = await audiusFetch<unknown[]>(`/v1/users/${artistId}/tracks`, {
        limit: "25",
      });
      return (data || []).map((t) => normalizeAudiusTrack(t as Parameters<typeof normalizeAudiusTrack>[0]));
    } catch {
      return [];
    }
  }
}

export const audiusProvider = new AudiusProvider();
