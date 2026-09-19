import { NextRequest, NextResponse } from "next/server";
import { musicService } from "@/services/music-service";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing artist ID" }, { status: 400 });
  }

  const decodedId = decodeURIComponent(id);

  try {
    const artist = await musicService.getArtist(decodedId);
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    return NextResponse.json(
      { artist },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[API /api/artist/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch artist details" },
      { status: 500 }
    );
  }
}
