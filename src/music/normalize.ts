import type { Track, Artist, MusicProviderName } from "@/types/music";

// Audius raw track from API
interface AudiusTrack {
  id: string;
  title: string;
  user: {
    id: string;
    name: string;
    handle: string;
    profile_picture?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string };
  };
  artwork?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string };
  duration: number;
  genre?: string;
  mood?: string;
  tags?: string;
  is_unlisted?: boolean;
  has_current_user_saved?: boolean;
  play_count?: number;
  release_date?: string;
  isrc?: string;
  is_explicit?: boolean;
  downloadable?: boolean;
}

interface AudiusUser {
  id: string;
  name: string;
  handle: string;
  profile_picture?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string };
  follower_count?: number;
  does_current_user_follow?: boolean;
}

export function normalizeAudiusTrack(raw: AudiusTrack): Track {
  const artwork =
    raw.artwork?.["480x480"] ||
    raw.artwork?.["150x150"] ||
    raw.user.profile_picture?.["480x480"] ||
    raw.user.profile_picture?.["150x150"] ||
    undefined;

  return {
    id: `audius:${raw.id}`,
    title: raw.title,
    artist: raw.user.name,
    artistId: `audius:${raw.user.id}`,
    artworkUrl: artwork,
    duration: raw.duration,
    provider: "audius" as MusicProviderName,
    providerTrackId: raw.id,
    isrc: raw.isrc,
    explicit: raw.is_explicit,
    availability: "PLAYABLE",
    stream: { type: "resolver" },
  };
}

export function normalizeAudiusUser(raw: AudiusUser): Artist {
  const artwork =
    raw.profile_picture?.["480x480"] ||
    raw.profile_picture?.["150x150"] ||
    undefined;

  return {
    id: `audius:${raw.id}`,
    name: raw.name,
    artworkUrl: artwork,
    provider: "audius" as MusicProviderName,
    providerArtistId: raw.id,
    followerCount: raw.follower_count,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeYouTubeMusicTrack(raw: any): Track {
  const artists = Array.isArray(raw.artists)
    ? raw.artists.map((a: { name: string }) => a.name).filter(Boolean).join(", ")
    : (raw.author?.name || raw.author || "Unknown Artist");

  let artworkUrl: string | undefined;
  if (Array.isArray(raw.thumbnails) && raw.thumbnails.length > 0) {
    const thumb = raw.thumbnails[raw.thumbnails.length - 1];
    artworkUrl = thumb?.url;
  } else if (raw.thumbnail?.url) {
    artworkUrl = raw.thumbnail.url;
  }

  if (artworkUrl && artworkUrl.startsWith("//")) {
    artworkUrl = `https:${artworkUrl}`;
  }

  // Upgrade Google/YouTube image resolution from tiny thumb (w60-h60) to high-res (w544-h544)
  if (artworkUrl && artworkUrl.includes("googleusercontent.com")) {
    artworkUrl = artworkUrl.replace(/=w\d+-h\d+/, "=w544-h544");
  }

  const durationSec = raw.duration?.seconds ?? (typeof raw.duration === "number" ? raw.duration : 0);

  return {
    id: `ytm:${raw.id}`,
    title: raw.title || "Unknown Title",
    artist: artists || "Unknown Artist",
    artistId: raw.artists?.[0]?.id ? `ytm:${raw.artists[0].id}` : undefined,
    album: raw.album?.name,
    albumId: raw.album?.id ? `ytm:${raw.album.id}` : undefined,
    artworkUrl,
    duration: durationSec,
    provider: "ytm",
    providerTrackId: raw.id,
    availability: "PLAYABLE",
    stream: { type: "resolver" },
  };
}
