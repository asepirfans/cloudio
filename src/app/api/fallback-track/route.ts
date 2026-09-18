import { NextRequest, NextResponse } from "next/server";
import { getYtClient } from "@/music/ytm/client";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const yt = await getYtClient();
    const results = await yt.search(q);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstVideo = results.videos?.[0] as any;

    if (!firstVideo?.id) {
      return NextResponse.json({ error: "No video found" }, { status: 404 });
    }

    return NextResponse.json({
      videoId: firstVideo.id,
      title: firstVideo.title?.toString(),
    });
  } catch (err) {
    console.error("[FallbackTrack] Error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
