import { NextRequest, NextResponse } from "next/server";
import { getYtClient } from "@/music/ytm/client";
import { normalizeYouTubeMusicTrack } from "@/music/normalize";
import type { Track } from "@/types/music";

export const runtime = "nodejs";

// Mood & semantic intent mapping to guarantee rich, relevant music discovery
function getSearchQueriesForPrompt(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const queries: string[] = [];

  if (p.includes("galau") || p.includes("sedih") || p.includes("patah hati") || p.includes("sad")) {
    queries.push(`${prompt} lagu`);
    queries.push("Lagu Galau Indonesia Populer");
    queries.push("Nostalgia Lagu Galau 2000an");
  } else if (p.includes("ngopi") || p.includes("kopi") || p.includes("lofi") || p.includes("chill") || p.includes("santai")) {
    queries.push(`${prompt} chill`);
    queries.push("Lofi Coffee Beats Santai");
    queries.push("Pop Akustik Indonesia Santai");
  } else if (p.includes("workout") || p.includes("gym") || p.includes("semangat") || p.includes("lari") || p.includes("fitness")) {
    queries.push(`${prompt} workout`);
    queries.push("Workout Motivation EDM Gym Hits");
    queries.push("Lagu Semangat Olahraga Beats");
  } else if (p.includes("night drive") || p.includes("drive") || p.includes("mobil") || p.includes("jalan malam")) {
    queries.push(`${prompt} songs`);
    queries.push("Night Drive Songs Chill Hits");
    queries.push("City Pop Chill Night Drive");
  } else if (p.includes("hujan") || p.includes("rain") || p.includes("syahdu")) {
    queries.push(`${prompt} lagu`);
    queries.push("Lagu Suasana Hujan Menenangkan");
    queries.push("Rainy Day Acoustic Vibes");
  } else {
    queries.push(`${prompt} lagu`);
    queries.push(prompt);
  }

  return queries;
}

export async function GET(req: NextRequest) {
  const prompt = req.nextUrl.searchParams.get("prompt");
  if (!prompt || prompt.trim().length < 2) {
    return NextResponse.json({ error: "Prompt is too short", tracks: [] }, { status: 400 });
  }

  const cleanPrompt = prompt.trim();
  const queries = getSearchQueriesForPrompt(cleanPrompt);

  try {
    const yt = await getYtClient();
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const allTracks: Track[] = [];

    // Search across complementary queries in parallel for diversity
    const searchPromises = queries.map((q) =>
      yt.music.search(q, { type: "song" }).catch(() => null)
    );
    const results = await Promise.all(searchPromises);

    for (const res of results) {
      if (!res) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const songs = (res.songs?.contents || []) as any[];

      for (const raw of songs) {
        const track = normalizeYouTubeMusicTrack(raw);
        if (!track.id || !track.title || !track.artist) continue;

        // Skip duplicates
        const titleKey = `${track.title.toLowerCase()} - ${track.artist.toLowerCase()}`;
        if (seenIds.has(track.id) || seenTitles.has(titleKey)) continue;

        // Filter out non-song long compilations
        const lowerTitle = track.title.toLowerCase();
        if (
          lowerTitle.includes("full album") ||
          lowerTitle.includes("kompilasi") ||
          lowerTitle.includes("1 hour") ||
          lowerTitle.includes("non stop")
        ) {
          continue;
        }
        if (track.duration && track.duration > 600) {
          continue;
        }

        seenIds.add(track.id);
        seenTitles.add(titleKey);
        allTracks.push(track);

        if (allTracks.length >= 20) break;
      }
      if (allTracks.length >= 20) break;
    }

    return NextResponse.json(
      {
        vibe: cleanPrompt,
        tracks: allTracks,
        total: allTracks.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    console.error("[API /api/vibe]", err);
    return NextResponse.json(
      { error: "Failed to generate vibe tracks", tracks: [] },
      { status: 502 }
    );
  }
}
