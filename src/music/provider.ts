import type { Track, SearchResults, StreamSource, AlbumDetail, ArtistDetail } from "@/types/music";

export interface MusicProvider {
  name: string;
  searchTracks(query: string): Promise<Track[]>;
  searchAll(query: string): Promise<SearchResults>;
  getTrack(id: string): Promise<Track | null>;
  getStream(providerTrackId: string): Promise<StreamSource | null>;
  getTrending?(): Promise<Track[]>;
  getArtistTracks?(artistId: string): Promise<Track[]>;
  getAlbum?(albumId: string): Promise<AlbumDetail | null>;
  getArtist?(artistId: string): Promise<ArtistDetail | null>;
}
