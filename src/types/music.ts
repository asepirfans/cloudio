export type MusicProviderName = "audius" | "jamendo" | "local" | "ytm";

export type TrackAvailability = "PLAYABLE" | "UNAVAILABLE" | "RESOLVING";

export type RepeatMode = "off" | "track" | "queue";

export type PlayerStatus =
  | "IDLE"
  | "RESOLVING"
  | "LOADING"
  | "PLAYING"
  | "PAUSED"
  | "BUFFERING"
  | "ENDED"
  | "ERROR";

export type StreamType = "direct" | "resolver";

export interface StreamSource {
  url: string;
  type: StreamType;
  provider: MusicProviderName;
  expiresAt?: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  artworkUrl?: string;
  duration?: number;
  provider: MusicProviderName;
  providerTrackId: string;
  isrc?: string;
  explicit?: boolean;
  stream?: {
    type: StreamType;
    url?: string;
  };
  availability?: TrackAvailability;
}

export interface Artist {
  id: string;
  name: string;
  artworkUrl?: string;
  provider: MusicProviderName;
  providerArtistId: string;
  followerCount?: number;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  total: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface Lyrics {
  trackId: string;
  plain?: string;
  synced?: LyricLine[];
  source?: string;
  language?: string;
}

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  status: PlayerStatus;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  showFullPlayer: boolean;
  showQueue: boolean;
  showLyrics: boolean;

  // Actions
  play: (track?: Track) => void;
  playSmartQueue: (track: Track) => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playNext: (track: Track) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setShowFullPlayer: (show: boolean) => void;
  setShowQueue: (show: boolean) => void;
  setShowLyrics: (show: boolean) => void;
  setStatus: (status: PlayerStatus) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setBuffering: (buffering: boolean) => void;
}

export interface AudioQuality {
  AUTO: "AUTO";
  LOW: "LOW";
  NORMAL: "NORMAL";
  HIGH: "HIGH";
}

export type AudioQualityLevel = keyof AudioQuality;
