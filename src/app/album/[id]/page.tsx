import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { musicService } from "@/services/music-service";
import { AlbumDetailClient } from "./AlbumDetailClient";

interface AlbumPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AlbumPageProps): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const album = await musicService.getAlbum(decodedId);
    if (!album) {
      return {
        title: "Album Tidak Ditemukan",
      };
    }

    return {
      title: `${album.title} - ${album.artist} | Cloudio`,
      description: `Dengarkan album ${album.title} oleh ${album.artist} di Cloudio.`,
    };
  } catch {
    return {
      title: "Album | Cloudio",
    };
  }
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const album = await musicService.getAlbum(decodedId);

    if (!album) {
      notFound();
    }

    return <AlbumDetailClient album={album} />;
  } catch (err) {
    console.error("[AlbumPage] Error loading album:", err);
    notFound();
  }
}
