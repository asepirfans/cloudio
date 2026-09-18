import { NextResponse } from "next/server";
import { musicService } from "@/services/music-service";

export async function GET() {
  try {
    const tracks = await musicService.getTrending();
    return NextResponse.json({ tracks }, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[API /trending]", err);
    return NextResponse.json({ tracks: [] }, { status: 502 });
  }
}
