import { StateCreator } from "zustand";
import { toast } from "sonner";
import { scrapeService } from "@/services/scrape.service";
import { spotifyService } from "@/services/spotify.service";
import { Playlist, SimpleTrack, ViewState } from "../types";
import { PlaylistSlice } from "./playlist.slice";
import { ArtistScrapingSlice } from "./artist-scraping.slice";

export interface DiscoveryState {
  discoveryPlaylists: Playlist[];
  tracks: SimpleTrack[];
  isLoadingTracks: boolean;
  discoveryLimit: number;
  discoveryView: ViewState;
  activeTrackPopup: string | null;
}

export interface DiscoveryActions {
  setDiscoveryLimit: (limit: number) => void;
  scrapePlaylists: () => Promise<void>;
  fetchTracks: () => Promise<void>;
  createPlaylist: () => Promise<void>;
  setDiscoveryView: (view: ViewState) => void;
  toggleTrackPopup: (trackId: string) => void;
  closeAllPopups: () => void;
}

export type DiscoverySlice = DiscoveryState & DiscoveryActions;

// This slice needs access to PlaylistSlice and ArtistScrapingSlice
export const createDiscoverySlice: StateCreator<
  DiscoverySlice & PlaylistSlice & ArtistScrapingSlice,
  [],
  [],
  DiscoverySlice
> = (set, get) => ({
  // State
  discoveryPlaylists: [],
  tracks: [],
  isLoadingTracks: false,
  discoveryLimit: 5,
  discoveryView: "playlists",
  activeTrackPopup: null,

  // Actions
  setDiscoveryLimit: (limit) => set({ discoveryLimit: limit }),

  scrapePlaylists: async () => {
    const { discoveryLimit, activeScrapes } = get();
    if (!activeScrapes.length) return;

    set({ isScraping: true });
    try {
      const data = await scrapeService.scrapePlaylists(
        discoveryLimit,
        activeScrapes[0]
      );
      set({ discoveryPlaylists: data, discoveryView: "playlists" });
    } catch (error) {
      console.error("Error scraping playlists:", error);
    } finally {
      set({ isScraping: false });
    }
  },

  fetchTracks: async () => {
    const { selectedGenres, discoveryPlaylists, playlists } = get();

    set({ isLoadingTracks: true });
    try {
      const data = await spotifyService.filterTracks({
        genres: selectedGenres,
        playlistsToFilter: discoveryPlaylists.map((p) => p.uri.split(":")[2]),
        playlistsToRemove: playlists,
      });
      set({
        tracks: data.tracks.sort(
          (a: SimpleTrack, b: SimpleTrack) =>
            Number(a.playcount) - Number(b.playcount)
        ),
        discoveryView: "tracks",
      });
    } catch (error) {
      console.error("Error fetching tracks:", error);
    } finally {
      set({ isLoadingTracks: false });
    }
  },

  createPlaylist: async () => {
    const { tracks } = get();
    const shortTracks = tracks.slice(0, 99);

    try {
      const data = await spotifyService.createPlaylist({
        tracks: shortTracks.map((track) => track.id),
      });
      const spotifyAppUri = data.link
        .replace("https://open.spotify.com/", "spotify:")
        .replace(/\//g, ":");
      toast("Playlist created", {
        description: "Your new playlist is ready",
        action: {
          label: "View on Spotify",
          onClick: () => window.open(spotifyAppUri, "_self"),
        },
      });
    } catch (error) {
      console.error("Error creating playlist:", error);
    }
  },

  setDiscoveryView: (view) => set({ discoveryView: view }),

  toggleTrackPopup: (trackId) => {
    const { activeTrackPopup } = get();
    set({ activeTrackPopup: activeTrackPopup === trackId ? null : trackId });
  },

  closeAllPopups: () => set({ activeTrackPopup: null }),
});

