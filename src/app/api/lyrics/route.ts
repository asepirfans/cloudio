import { NextRequest, NextResponse } from "next/server";
import type { LyricLine, Lyrics } from "@/types/music";

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

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const duration = req.nextUrl.searchParams.get("duration") ?? "";

  if (!artist || !title) {
    return NextResponse.json({ lyrics: null });
  }

  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (duration) params.set("duration", duration);

    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
      headers: { "Lrclib-Client": "CloudBeats/1.0 (https://github.com)" },
      next: { revalidate: 86400 }, // cache 24h
    });

    if (!res.ok) {
      return NextResponse.json({ lyrics: null });
    }

    const data = await res.json();

    const lyrics: Lyrics = {
      trackId: `${artist}:${title}`,
      plain: data.plainLyrics ?? undefined,
      synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : undefined,
      source: "lrclib",
    };

    if (!lyrics.plain && !lyrics.synced) {
      return NextResponse.json({ lyrics: null });
    }

    return NextResponse.json({ lyrics }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("[API /lyrics]", err);
    return NextResponse.json({ lyrics: null });
  }
}
