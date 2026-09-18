import { getYtClient } from "./client";
import { normalizeYouTubeMusicTrack } from "../normalize";
import type { MusicProvider } from "../provider";
import type { Track, Artist, SearchResults, StreamSource } from "@/types/music";

export class YouTubeMusicProvider implements MusicProvider {
  name = "ytm";

  async searchTracks(query: string): Promise<Track[]> {
    try {
      const yt = await getYtClient();
      const res = await yt.music.search(query, { type: "song" });
      const songs = res.songs?.contents || [];
      return songs.map((s) => normalizeYouTubeMusicTrack(s));
    } catch (err) {
      console.error("[YTM] searchTracks error:", err);
      return [];
    }
  }

  async searchAll(query: string): Promise<SearchResults> {
    try {
      const yt = await getYtClient();
      const res = await yt.music.search(query, { type: "song" });
      const songs = res.songs?.contents || [];
      const tracks = songs.map((s) => normalizeYouTubeMusicTrack(s));

      const artists: Artist[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawArtists = (res as any).artists?.contents;
      if (Array.isArray(rawArtists)) {
        for (const a of rawArtists) {
          artists.push({
            id: `ytm:${a.id}`,
            name: a.name || "Unknown Artist",
            artworkUrl: a.thumbnails?.[0]?.url,
            provider: "ytm",
            providerArtistId: a.id || "",
          });
        }
      }

      return {
        tracks,
        artists,
        total: tracks.length,
      };
    } catch (err) {
      console.error("[YTM] searchAll error:", err);
      return { tracks: [], artists: [], total: 0 };
    }
  }

  async getTrack(providerTrackId: string): Promise<Track | null> {
    try {
      const yt = await getYtClient();
      const info = await yt.music.getInfo(providerTrackId);
      if (!info.basic_info) return null;
      return normalizeYouTubeMusicTrack({
        id: providerTrackId,
        title: info.basic_info.title,
        artists: info.basic_info.author ? [{ name: info.basic_info.author }] : [],
        duration: { seconds: info.basic_info.duration },
        thumbnails: info.basic_info.thumbnail,
      });
    } catch (err) {
      console.error("[YTM] getTrack error:", err);
      return null;
    }
  }

  async getStream(providerTrackId: string): Promise<StreamSource | null> {
    try {
      const yt = await getYtClient();
      const info = await yt.music.getInfo(providerTrackId);
      const formats = info.streaming_data?.adaptive_formats || [];
      const audioFormats = formats.filter((f) => f.has_audio);

      if (audioFormats.length === 0) {
        console.error("[YTM] No audio formats found for", providerTrackId);
        return null;
      }

      // Prioritize standard audio formats (itag 140 = AAC/m4a, itag 251 = Opus/webm)
      const selected =
        audioFormats.find((f) => f.itag === 140) ||
        audioFormats.find((f) => f.itag === 251) ||
        audioFormats[0];

      let streamUrl = selected.url;
      if (!streamUrl && (selected.cipher || selected.signature_cipher)) {
        streamUrl = await selected.decipher(yt.session.player);
      }

      if (!streamUrl) {
        console.error("[YTM] Failed to decipher stream URL for", providerTrackId);
        return null;
      }

      return {
        url: streamUrl,
        type: "direct",
        provider: "ytm",
        expiresAt: Date.now() + 5 * 60 * 60 * 1000,
      };
    } catch (err) {
      console.error("[YTM] getStream error:", err);
      return null;
    }
  }

  async getTrending(): Promise<Track[]> {
    try {
      const yt = await getYtClient();
      const res = await yt.music.search("Lagu Indonesia Hits Terpopuler", { type: "song" });
      const songs = res.songs?.contents || [];
      return songs.map((s) => normalizeYouTubeMusicTrack(s));
    } catch (err) {
      console.error("[YTM] getTrending error:", err);
      return [];
    }
  }

  async getHomeSections(): Promise<{
    indonesianHits: Track[];
    globalHits: Track[];
    chillHits: Track[];
  }> {
    try {
      const yt = await getYtClient();
      const [resIndo, resGlobal, resChill] = await Promise.all([
        yt.music.search("Lagu Indonesia Hits Terpopuler", { type: "song" }).catch(() => null),
        yt.music.search("Hits Barat Terpopuler Bruno Mars", { type: "song" }).catch(() => null),
        yt.music.search("Pop Akustik Indonesia Populer", { type: "song" }).catch(() => null),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filterSongs = (rawList: any[] = []): Track[] => {
        return rawList
          .map((s) => normalizeYouTubeMusicTrack(s))
          .filter((t) => {
            if (!t.title || !t.artist) return false;
            const lower = t.title.toLowerCase();
            if (
              lower.includes("top 100") ||
              lower.includes("hours") ||
              lower.includes("kompilasi") ||
              lower.includes("full album")
            ) {
              return false;
            }
            if (t.duration && t.duration > 600) return false;
            return true;
          });
      };

      return {
        indonesianHits: filterSongs(resIndo?.songs?.contents),
        globalHits: filterSongs(resGlobal?.songs?.contents),
        chillHits: filterSongs(resChill?.songs?.contents),
      };
    } catch (err) {
      console.error("[YTM] getHomeSections error:", err);
      return { indonesianHits: [], globalHits: [], chillHits: [] };
    }
  }

  async getArtistTracks(artistId: string): Promise<Track[]> {
    try {
      const yt = await getYtClient();
      const artist = await yt.music.getArtist(artistId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const songs = (artist as any).songs?.contents || [];
      return songs.map((s: unknown) => normalizeYouTubeMusicTrack(s));
    } catch (err) {
      console.error("[YTM] getArtistTracks error:", err);
      return [];
    }
  }
}

export const ytmProvider = new YouTubeMusicProvider();
