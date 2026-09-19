import { NextRequest, NextResponse } from "next/server";
import { getYtClient } from "@/music/ytm/client";
import { normalizeYouTubeMusicTrack } from "@/music/normalize";
import type { Track } from "@/types/music";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const trackId = searchParams.get("trackId") || "";
  const artist = searchParams.get("artist") || "";

  const decodedTrackId = decodeURIComponent(trackId);
  const parts = decodedTrackId.split(":");
  const providerTrackId = parts.length > 1 ? parts.slice(1).join(":") : decodedTrackId;

  try {
    const yt = await getYtClient();
    const tracks: Track[] = [];
    const seenIds = new Set<string>();

    if (providerTrackId) {
      seenIds.add(decodedTrackId);
      seenIds.add(`ytm:${providerTrackId}`);
      seenIds.add(providerTrackId);
    }

    // 1. Primary: YouTube Music Native getUpNext Radio
    if (providerTrackId) {
      try {
        const upNext = await yt.music.getUpNext(providerTrackId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contents = (upNext.contents || []) as any[];

        for (const item of contents) {
          const rawId = item.id || item.video_id;
          if (!rawId) continue;
          const fullId = `ytm:${rawId}`;
          if (seenIds.has(fullId)) continue;
          seenIds.add(fullId);

          const title = item.title?.text || item.title || "Unknown Title";
          const itemArtist =
            item.author?.text ||
            item.author?.name ||
            (typeof item.author === "string" ? item.author : artist || "Unknown Artist");

          const artworkUrl = item.thumbnail?.[0]?.url;

          // Duration parsing
          let durationSeconds: number | undefined = undefined;
          if (typeof item.duration?.seconds === "number") {
            durationSeconds = item.duration.seconds;
          } else if (item.duration?.text) {
            const timeParts = item.duration.text.split(":").map(Number);
            if (timeParts.length === 2) durationSeconds = timeParts[0] * 60 + timeParts[1];
            else if (timeParts.length === 3) durationSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
          }

          tracks.push({
            id: fullId,
            title,
            artist: itemArtist,
            artworkUrl,
            duration: durationSeconds,
            provider: "ytm",
            providerTrackId: rawId,
            availability: "PLAYABLE",
            stream: {
              type: "resolver",
            },
          });
        }
      } catch (err) {
        console.warn("[/api/recommendations] getUpNext failed:", err);
      }
    }

    // 2. Secondary / Fallback: Top songs by the same artist
    if (tracks.length < 10 && artist) {
      const cleanArtist = artist.split(/[(,]|feat\./i)[0].trim();
      try {
        const artistSearch = await yt.music.search(cleanArtist || artist, { type: "song" });
        const songs = artistSearch.songs?.contents || [];
        for (const s of songs) {
          const t = normalizeYouTubeMusicTrack(s);
          if (!seenIds.has(t.id)) {
            seenIds.add(t.id);
            tracks.push(t);
          }
        }
      } catch (err) {
        console.warn("[/api/recommendations] artist search fallback failed:", err);
      }
    }

    // 3. Guaranteed safety net fallback if still empty
    if (tracks.length === 0) {
      try {
        const fallbackSearch = await yt.music.search("popular hits", { type: "song" });
        const songs = fallbackSearch.songs?.contents || [];
        for (const s of songs) {
          const t = normalizeYouTubeMusicTrack(s);
          if (!seenIds.has(t.id)) {
            seenIds.add(t.id);
            tracks.push(t);
          }
        }
      } catch (err) {
        console.warn("[/api/recommendations] global fallback failed:", err);
      }
    }

    return NextResponse.json({ tracks });
  } catch (err) {
    console.error("[/api/recommendations] error:", err);
    return NextResponse.json({ tracks: [] });
  }
}
