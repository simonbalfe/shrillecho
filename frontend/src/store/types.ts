// Scrape types
export interface ScrapeResponse {
  id: number;
  total_artists: number;
  seed_artist: string;
  depth: number;
}

export interface Artist {
  id: string;
  profile?: { name: string };
  visuals?: { avatarImage?: { sources?: Array<{ url: string }> } };
  uri: string;
}

// Playlist types
export interface Playlist {
  name: string;
  cover_art: string;
  uri: string;
  saves: number;
}

// Track types
interface ArtistSimple {
  name: string;
}

interface CoverArt {
  sources: Array<{ url: string; height: number; width: number }>;
}

export interface SimpleTrack {
  name: string;
  id: string;
  artists: ArtistSimple[];
  playcount: string;
  coverArt: CoverArt;
  genres: string[];
}

export type ViewState = "playlists" | "tracks";
export type DashboardView = "artists" | "discovery";

