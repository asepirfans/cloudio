import type { Metadata } from "next";
import { LibraryClient } from "./LibraryClient";

export const metadata: Metadata = {
  title: "Pustaka Musik - Cloudio",
  description: "Kelola playlist kustom dan bucket lagu offline Anda.",
};

export default function LibraryPage() {
  return <LibraryClient />;
}
