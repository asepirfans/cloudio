import type { Metadata } from "next";
import { musicService } from "@/services/music-service";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "Home",
  description: "Discover trending music, Indonesian hits, and global favorites on CloudBeats.",
};

export default async function HomePage() {
  const sections = await musicService.getHomeSections().catch(() => ({
    indonesianHits: [],
    globalHits: [],
    chillHits: [],
  }));

  return <HomeClient sections={sections} />;
}
