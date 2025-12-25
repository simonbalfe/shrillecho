import { api } from "./api";
import { parseSpotifyId } from "@/utils/spotify";

export interface FilterTracksParams {
  genres: string[];
  playlistsToFilter: string[];
  playlistsToRemove: string[];
  applyUnique?: boolean;
  trackLimit?: number;
  monthlyListeners?: { min: number; max: number };
}

export interface CreatePlaylistParams {
  tracks: string[];
}

export const spotifyService = {
  getPlaylistGenres: async (playlistId: string): Promise<string[]> => {
    return api.get(`/spotify/playlists/genres?id=${parseSpotifyId(playlistId)}`);
  },

  filterTracks: async (params: FilterTracksParams) => {
    return api.post("/spotify/playlist/filter", {
      genres: params.genres,
      playlists_to_filter: params.playlistsToFilter,
      playlists_to_remove: params.playlistsToRemove.map(parseSpotifyId),
      apply_unique: params.applyUnique ?? true,
      track_limit: params.trackLimit ?? 99,
      monthly_listeners: params.monthlyListeners ?? { min: 0, max: 10000 },
    });
  },

  createPlaylist: async (params: CreatePlaylistParams) => {
    return api.post("/spotify/playlist/create", {
      tracks: params.tracks,
    });
  },
};

