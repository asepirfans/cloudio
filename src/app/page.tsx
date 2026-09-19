import type { Metadata } from "next";
import { musicService } from "@/services/music-service";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "Home",
  description: "Discover trending music, Indonesian hits, and global favorites on Cloudio.",
};

// Revalidate home feed every 1 hour to fetch fresh popular songs from YouTube Music
export const revalidate = 3600;

export default async function HomePage() {
  const sections = await musicService.getHomeSections().catch(() => ({
    indonesianHits: [],
    globalHits: [],
    chillHits: [],
  }));

  return <HomeClient sections={sections} />;
}
