import { api } from "./api";

export interface ScrapeArtistsParams {
  artist: string;
  depth: number;
}

export interface Playlist {
  name: string;
  cover_art: string;
  uri: string;
  saves: number;
}

export const scrapeService = {
  scrapeArtists: async (params: ScrapeArtistsParams) => {
    return api.post("/scrape/artists", params);
  },

  scrapePlaylistSeed: async (playlistId: string) => {
    return api.get(`/scrape/playlists_seed?id=${playlistId}`);
  },

  scrapePlaylists: async (limit: number, poolId: number): Promise<Playlist[]> => {
    return api.get(`/scrape/playlists?limit=${limit}&pool=${poolId}`);
  },
};

