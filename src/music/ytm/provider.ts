import { getYtClient } from "./client";
import { normalizeYouTubeMusicTrack } from "../normalize";
import type { MusicProvider } from "../provider";
import type { Track, Artist, ArtistDetail, Album, AlbumDetail, SearchResults, StreamSource } from "@/types/music";

export class YouTubeMusicProvider implements MusicProvider {
  name = "ytm";

  async searchTracks(query: string): Promise<Track[]> {
    try {
      const yt = await getYtClient();
      const res = await yt.music.search(query, { type: "song" });
      const songs = res.songs?.contents || [];
      const seen = new Set<string>();
      return songs
        .map((s) => normalizeYouTubeMusicTrack(s))
        .filter((t) => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
    } catch (err) {
      console.error("[YTM] searchTracks error:", err);
      return [];
    }
  }

  async searchAll(query: string): Promise<SearchResults> {
    try {
      const yt = await getYtClient();
      const [songSearch, artistSearch, albumSearch] = await Promise.all([
        yt.music.search(query, { type: "song" }).catch(() => null),
        yt.music.search(query, { type: "artist" }).catch(() => null),
        yt.music.search(query, { type: "album" }).catch(() => null),
      ]);

      const res = songSearch;
      let songs = res?.songs?.contents || [];

      // Smart lyric fallback: If 0 songs and query contains multiple words (like a lyric snippet)
      if (songs.length === 0 && query.trim().includes(" ")) {
        try {
          const lyricRes = await yt.music.search(`${query} lyric`, { type: "song" });
          if (lyricRes.songs?.contents?.length) {
            songs = lyricRes.songs.contents;
          }
        } catch {
          // ignore fallback error
        }
      }

      const seen = new Set<string>();
      const tracks = songs
        .map((s) => normalizeYouTubeMusicTrack(s))
        .filter((t) => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });

      const artists: Artist[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawArtists = (
        (artistSearch as any)?.artists?.contents ||
        (artistSearch as any)?.contents ||
        (res as any)?.artists?.contents ||
        []
      ) as any[];
      const seenArtists = new Set<string>();
      if (Array.isArray(rawArtists)) {
        for (const a of rawArtists) {
          if (!a.id || seenArtists.has(a.id)) continue;
          seenArtists.add(a.id);
          artists.push({
            id: `ytm:${a.id}`,
            name: a.name || "Unknown Artist",
            artworkUrl: a.thumbnails?.[0]?.url,
            provider: "ytm",
            providerArtistId: a.id || "",
          });
        }
      }

      // Check if search query is directly matching artist name
      const cleanQ = query.toLowerCase().trim();
      const topArtist = artists[0];
      let isArtistMatch = false;

      if (topArtist && cleanQ.length >= 2) {
        const aName = topArtist.name.toLowerCase().trim();
        // True only if user searched directly for this artist name
        if (cleanQ === aName || aName.startsWith(cleanQ) || cleanQ.startsWith(aName)) {
          isArtistMatch = true;
        }
      }

      const albums: Album[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawAlbums = ((albumSearch as any)?.albums?.contents || (albumSearch as any)?.contents || []) as any[];
      const seenAlbums = new Set<string>();
      if (Array.isArray(rawAlbums)) {
        for (const a of rawAlbums) {
          if (!a.id || seenAlbums.has(a.id)) continue;
          seenAlbums.add(a.id);
          const artistName =
            a.author?.name ||
            (Array.isArray(a.artists) ? a.artists[0]?.name : null) ||
            "Unknown Artist";
          const artworkUrl = a.thumbnails?.[0]?.url || "";
          albums.push({
            id: `ytm:${a.id}`,
            title: a.title?.toString() || "Unknown Album",
            artist: artistName,
            artistId: a.author?.channel_id || a.artists?.[0]?.id,
            artworkUrl,
            year: a.year?.toString() || undefined,
            provider: "ytm",
            providerAlbumId: a.id,
          });
        }
      }

      return {
        tracks,
        artists,
        albums,
        isArtistMatch,
        total: tracks.length + artists.length + albums.length,
      };
    } catch (err) {
      console.error("[YTM] searchAll error:", err);
      return { tracks: [], artists: [], albums: [], isArtistMatch: false, total: 0 };
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
      const seen = new Set<string>();
      return songs
        .map((s) => normalizeYouTubeMusicTrack(s))
        .filter((t) => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
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
        yt.music.search("Top Indonesia Hits", { type: "song" }).catch(() => null),
        yt.music.search("Today Top Hits Global", { type: "song" }).catch(() => null),
        yt.music.search("Pop Akustik Indonesia Populer", { type: "song" }).catch(() => null),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filterSongs = (rawList: any[] = []): Track[] => {
        const seen = new Set<string>();
        return rawList
          .map((s) => normalizeYouTubeMusicTrack(s))
          .filter((t) => {
            if (!t.id || seen.has(t.id)) return false;
            seen.add(t.id);
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

  async getAlbum(albumId: string): Promise<AlbumDetail | null> {
    try {
      const yt = await getYtClient();
      const cleanId = albumId.startsWith("ytm:") ? albumId.slice(4) : albumId;
      const album = await yt.music.getAlbum(cleanId);
      if (!album) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const header = album.header as any;
      const title = header?.title?.toString() || "Unknown Album";
      const artist =
        header?.author?.name ||
        header?.strapline_text_one?.toString() ||
        "Unknown Artist";
      const year = header?.subtitle?.toString() || "";
      const artworkUrl = header?.thumbnail?.contents?.[0]?.url || "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTracks = (album.contents || []) as any[];
      const tracks: Track[] = rawTracks
        .map((t, idx) => {
          if (!t.id) return null;
          const trackTitle = t.title?.toString() || `Track ${idx + 1}`;
          const trackArtist =
            t.artists?.[0]?.name ||
            t.author?.name ||
            artist;
          const durationSec = t.duration?.seconds || 0;
          return {
            id: `ytm:${t.id}`,
            title: trackTitle,
            artist: trackArtist,
            album: title,
            albumId: `ytm:${cleanId}`,
            artworkUrl: artworkUrl,
            duration: durationSec,
            provider: "ytm" as const,
            providerTrackId: t.id,
            availability: "PLAYABLE" as const,
          };
        })
        .filter(Boolean) as Track[];

      return {
        id: `ytm:${cleanId}`,
        title,
        artist,
        artworkUrl,
        year,
        trackCount: tracks.length,
        provider: "ytm",
        providerAlbumId: cleanId,
        tracks,
      };
    } catch (err) {
      console.error("[YTM] getAlbum error:", err);
      return null;
    }
  }

  async getArtist(artistId: string): Promise<ArtistDetail | null> {
    try {
      const yt = await getYtClient();
      const cleanId = artistId.startsWith("ytm:") ? artistId.slice(4) : artistId;
      const artist = await yt.music.getArtist(cleanId);
      if (!artist) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const header = artist.header as any;
      const name = header?.title?.toString() || "Unknown Artist";
      const artworkUrl =
        header?.thumbnail?.contents?.[0]?.url ||
        header?.thumbnails?.[0]?.url ||
        "";
      const description = header?.description?.toString() || undefined;
      const subscriberCount = header?.subscribers?.toString() || undefined;

      // Fetch popular songs of this artist
      const songRes = await yt.music.search(name, { type: "song" }).catch(() => null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawSongs = (songRes?.songs?.contents || []) as any[];

      const seen = new Set<string>();
      const popularTracks: Track[] = rawSongs
        .map((s) => normalizeYouTubeMusicTrack(s))
        .filter((t) => {
          if (!t.id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });

      return {
        id: `ytm:${cleanId}`,
        name,
        artworkUrl,
        provider: "ytm",
        providerArtistId: cleanId,
        popularTracks,
        description,
        subscriberCount,
      };
    } catch (err) {
      console.error("[YTM] getArtist error:", err);
      return null;
    }
  }
}

export const ytmProvider = new YouTubeMusicProvider();
