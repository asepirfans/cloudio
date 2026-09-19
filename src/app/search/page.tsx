import type { Metadata } from "next";
import { SearchClient } from "./SearchClient";

export const metadata: Metadata = {
  title: "Search",
  description: "Search for songs and artists on Cloudio.",
};

export default function SearchPage() {
  return <SearchClient />;
}
