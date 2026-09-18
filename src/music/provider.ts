import type { Track, SearchResults, StreamSource } from "@/types/music";

export interface MusicProvider {
  name: string;
  searchTracks(query: string): Promise<Track[]>;
  searchAll(query: string): Promise<SearchResults>;
  getTrack(id: string): Promise<Track | null>;
  getStream(providerTrackId: string): Promise<StreamSource | null>;
  getTrending?(): Promise<Track[]>;
  getArtistTracks?(artistId: string): Promise<Track[]>;
}
