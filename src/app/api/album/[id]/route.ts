import { NextRequest, NextResponse } from "next/server";
import { musicService } from "@/services/music-service";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing album ID" }, { status: 400 });
  }

  const decodedId = decodeURIComponent(id);

  try {
    const album = await musicService.getAlbum(decodedId);
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json(
      { album },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[API /api/album/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch album details" },
      { status: 500 }
    );
  }
}
