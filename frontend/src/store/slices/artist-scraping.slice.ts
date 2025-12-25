import { StateCreator } from "zustand";
import { scrapeService } from "@/services/scrape.service";
import { Artist, ScrapeResponse } from "../types";
import { PlaylistSlice } from "./playlist.slice";

export interface ArtistScrapingState {
  artistInput: string;
  depth: string;
  isScraping: boolean;
  artistData: Artist[];
  scrapes: ScrapeResponse[];
  activeScrapes: number[];
  wsStatus: string;
}

export interface ArtistScrapingActions {
  setArtistInput: (value: string) => void;
  setDepth: (value: string) => void;
  scrapeArtists: () => Promise<void>;
  scrapePlaylistSeed: () => Promise<void>;
  addScrapeResponse: (response: ScrapeResponse) => void;
  toggleActiveScrape: (id: number, checked: boolean) => void;
  setWsStatus: (status: string) => void;
}

export type ArtistScrapingSlice = ArtistScrapingState & ArtistScrapingActions;

// This slice needs access to PlaylistSlice for playlists
export const createArtistScrapingSlice: StateCreator<
  ArtistScrapingSlice & PlaylistSlice,
  [],
  [],
  ArtistScrapingSlice
> = (set, get) => ({
  // State
  artistInput: "",
  depth: "2",
  isScraping: false,
  artistData: [],
  scrapes: [],
  activeScrapes: [],
  wsStatus: "Disconnected",

  // Actions
  setArtistInput: (value) => set({ artistInput: value }),
  setDepth: (value) => set({ depth: value }),

  scrapeArtists: async () => {
    const { artistInput, depth } = get();
    set({ isScraping: true });
    try {
      const response = await scrapeService.scrapeArtists({
        artist: artistInput,
        depth: parseInt(depth),
      });
      const artistsArray =
        response.artists?.filter(
          (artist: Artist) => artist.id && artist.profile?.name
        ) || [];
      set({ artistData: artistsArray });
    } catch (error) {
      console.error("Error scraping artists:", error);
      set({ artistData: [] });
    } finally {
      set({ isScraping: false });
    }
  },

  scrapePlaylistSeed: async () => {
    const { playlists } = get();
    if (!playlists.length) return;

    set({ isScraping: true });
    try {
      await scrapeService.scrapePlaylistSeed(playlists[0]);
    } catch (error) {
      console.error("Error scraping playlist seed:", error);
    } finally {
      set({ isScraping: false });
    }
  },

  addScrapeResponse: (response) => {
    const { scrapes } = get();
    const exists = scrapes.some((s) => s.id === response.id);
    if (!exists) {
      set({ scrapes: [...scrapes, response] });
    }
  },

  toggleActiveScrape: (id, checked) => {
    const { activeScrapes } = get();
    set({
      activeScrapes: checked
        ? [...activeScrapes, id]
        : activeScrapes.filter((scrapeId) => scrapeId !== id),
    });
  },

  setWsStatus: (status) => set({ wsStatus: status }),
});

