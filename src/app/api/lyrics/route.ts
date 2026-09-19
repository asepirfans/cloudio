import { NextRequest, NextResponse } from "next/server";
import type { LyricLine, Lyrics } from "@/types/music";
import { getYtClient } from "@/music/ytm/client";

const LRCLIB_BASE = "https://lrclib.net/api";

function parseLRC(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const raw of lrcText.split("\n")) {
    const match = raw.match(lineRegex);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, "0"), 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

function cleanTrackTitle(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\[\s*(?:official\s+)?(?:music\s+)?video\s*\]/gi, "")
    .replace(/\(\s*(?:official\s+)?(?:music\s+)?video\s*\)/gi, "")
    .replace(/\[\s*(?:official\s+)?audio\s*\]/gi, "")
    .replace(/\(\s*(?:official\s+)?audio\s*\)/gi, "")
    .replace(/\[\s*(?:official\s+)?lyric(?:s)?(?:\s+video)?\s*\]/gi, "")
    .replace(/\(\s*(?:official\s+)?lyric(?:s)?(?:\s+video)?\s*\)/gi, "")
    .replace(/\[\s*visualizer\s*\]/gi, "")
    .replace(/\(\s*visualizer\s*\)/gi, "")
    .replace(/\[\s*live(?:\s+at\s+[^\]]+)?\s*\]/gi, "")
    .replace(/\(\s*live(?:\s+at\s+[^)]+)?\s*\)/gi, "")
    .replace(/\[\s*(?:remastered|remaster)\s*\d*\s*\]/gi, "")
    .replace(/\(\s*(?:remastered|remaster)\s*\d*\s*\)/gi, "")
    .replace(/\[\s*(?:hd|4k|1080p)\s*\]/gi, "")
    .replace(/\(\s*(?:hd|4k|1080p)\s*\)/gi, "")
    .replace(/\bfeat\.?\s+[^()[\]]+/gi, "")
    .replace(/\bft\.?\s+[^()[\]]+/gi, "")
    .replace(/\(feat\.?[^)]+\)/gi, "")
    .replace(/\[feat\.?[^\]]+\]/gi, "")
    .replace(/\s*-\s*(?:official\s+)?video/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtistName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .replace(/\s*,\s*.*$/, "")
    .replace(/\s*&\s*.*$/, "")
    .replace(/\s*feat\.?.*$/i, "")
    .replace(/\s*ft\.?.*$/i, "")
    .trim();
}

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const durationParam = req.nextUrl.searchParams.get("duration");
  const trackId = req.nextUrl.searchParams.get("trackId") ?? "";
  let videoId = req.nextUrl.searchParams.get("videoId") ?? "";

  if (!artist && !title) {
    return NextResponse.json({ lyrics: null });
  }

  // Extract videoId if not directly provided
  if (!videoId && trackId) {
    if (trackId.startsWith("ytm:")) {
      videoId = trackId.slice(4);
    } else if (!trackId.includes(":")) {
      videoId = trackId;
    }
  }

  const cleanTitle = cleanTrackTitle(title) || title.trim();
  const cleanArtist = cleanArtistName(artist) || artist.trim();
  const durationNum = durationParam ? parseInt(durationParam, 10) : undefined;

  const cacheHeaders = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };

  // 1. Tier 1: LRCLIB exact get (provides synced lyrics)
  try {
    const params = new URLSearchParams({ artist_name: cleanArtist, track_name: cleanTitle });
    if (durationNum && !isNaN(durationNum)) {
      params.set("duration", String(durationNum));
    }

    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
      headers: { "Lrclib-Client": "Cloudio/1.0 (https://github.com)" },
      next: { revalidate: 86400 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics || data.plainLyrics) {
        const lyrics: Lyrics = {
          trackId: trackId || `${cleanArtist}:${cleanTitle}`,
          plain: data.plainLyrics ?? undefined,
          synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : undefined,
          source: data.syncedLyrics ? "LRCLIB (Sinkron)" : "LRCLIB",
        };
        return NextResponse.json({ lyrics }, { headers: cacheHeaders });
      }
    }
  } catch (err) {
    console.warn("[API /lyrics] LRCLIB get error:", err);
  }

  // 2. Tier 2: LRCLIB search fallback (fuzzy search for synced lyrics)
  try {
    const searchQueries = [
      `${cleanTitle} ${cleanArtist}`,
      cleanTitle,
    ];

    for (const query of searchQueries) {
      const res = await fetch(`${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`, {
        headers: { "Lrclib-Client": "Cloudio/1.0 (https://github.com)" },
        next: { revalidate: 86400 },
      });

      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list: any[] = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          // Prioritize result with synced lyrics and close duration if possible
          const best =
            list.find((item) => {
              if (!item.syncedLyrics) return false;
              if (durationNum && item.duration) {
                return Math.abs(item.duration - durationNum) <= 12;
              }
              return true;
            }) ||
            list.find((item) => item.syncedLyrics) ||
            list[0];

          if (best && (best.syncedLyrics || best.plainLyrics)) {
            const lyrics: Lyrics = {
              trackId: trackId || `${cleanArtist}:${cleanTitle}`,
              plain: best.plainLyrics ?? undefined,
              synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : undefined,
              source: best.syncedLyrics ? "LRCLIB (Sinkron)" : "LRCLIB",
            };
            return NextResponse.json({ lyrics }, { headers: cacheHeaders });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[API /lyrics] LRCLIB search error:", err);
  }

  // 3. Tier 3: YouTube Music Native Lyrics (Musixmatch / Official)
  if (videoId) {
    try {
      const yt = await getYtClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yLyrics: any = await yt.music.getLyrics(videoId).catch(() => null);
      if (yLyrics) {
        const plainText = yLyrics.description?.toString();
        const footerText = yLyrics.footer?.toString() || "YouTube Music";
        if (plainText && plainText.trim().length > 0) {
          const lyrics: Lyrics = {
            trackId: trackId || videoId,
            plain: plainText.trim(),
            source: footerText,
          };
          return NextResponse.json({ lyrics }, { headers: cacheHeaders });
        }
      }
    } catch (err) {
      console.warn("[API /lyrics] YTM lyrics fetch error:", err);
    }
  }

  // 4. Tier 4: Search YouTube Music for track if videoId was missing
  if (!videoId && (cleanTitle || cleanArtist)) {
    try {
      const yt = await getYtClient();
      const searchRes = await yt.music.search(`${cleanTitle} ${cleanArtist}`, { type: "song" });
      const foundSong = searchRes.songs?.contents?.[0];
      if (foundSong?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const yLyrics: any = await yt.music.getLyrics(foundSong.id).catch(() => null);
        if (yLyrics) {
          const plainText = yLyrics.description?.toString();
          const footerText = yLyrics.footer?.toString() || "YouTube Music";
          if (plainText && plainText.trim().length > 0) {
            const lyrics: Lyrics = {
              trackId: trackId || foundSong.id,
              plain: plainText.trim(),
              source: footerText,
            };
            return NextResponse.json({ lyrics }, { headers: cacheHeaders });
          }
        }
      }
    } catch (err) {
      console.warn("[API /lyrics] YTM search lyrics fallback error:", err);
    }
  }

  // No lyrics found on any tier
  return NextResponse.json({ lyrics: null });
}
