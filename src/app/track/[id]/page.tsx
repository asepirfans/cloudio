import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { musicService } from "@/services/music-service";
import { TrackDetailClient } from "./TrackDetailClient";

interface TrackPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const track = await musicService.getTrack(decodedId);
    if (!track) {
      return {
        title: "Lagu Tidak Ditemukan | Cloudio",
      };
    }

    const title = `${track.title} - ${track.artist} | Cloudio`;
    const description = `Dengarkan lagu ${track.title} oleh ${track.artist} di Cloudio.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "music.song",
        images: track.artworkUrl
          ? [
              {
                url: track.artworkUrl,
                width: 500,
                height: 500,
                alt: `${track.title} - ${track.artist}`,
              },
            ]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: track.artworkUrl ? [track.artworkUrl] : [],
      },
    };
  } catch {
    return {
      title: "Lagu | Cloudio",
    };
  }
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const track = await musicService.getTrack(decodedId);

    if (!track) {
      notFound();
    }

    return <TrackDetailClient track={track} />;
  } catch (err) {
    console.error("[TrackPage] Error loading track:", err);
    notFound();
  }
}
