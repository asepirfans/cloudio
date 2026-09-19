import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { musicService } from "@/services/music-service";
import { ArtistDetailClient } from "./ArtistDetailClient";

interface ArtistPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const artist = await musicService.getArtist(decodedId);
    if (!artist) {
      return {
        title: "Artis Tidak Ditemukan",
      };
    }

    return {
      title: `${artist.name} - Lagu Populer | Cloudio`,
      description: `Dengarkan kumpulan lagu terpopuler dari ${artist.name} di Cloudio.`,
    };
  } catch {
    return {
      title: "Artis | Cloudio",
    };
  }
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const artist = await musicService.getArtist(decodedId);

    if (!artist) {
      notFound();
    }

    return <ArtistDetailClient artist={artist} />;
  } catch (err) {
    console.error("[ArtistPage] Error loading artist:", err);
    notFound();
  }
}
