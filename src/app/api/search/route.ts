import { NextRequest, NextResponse } from "next/server";
import { musicService } from "@/services/music-service";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 1) {
    return NextResponse.json({ tracks: [], artists: [] });
  }

  try {
    const results = await musicService.search(query.trim());
    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[API /search]", err);
    return NextResponse.json(
      { error: "Search failed", tracks: [], artists: [] },
      { status: 502 }
    );
  }
}
