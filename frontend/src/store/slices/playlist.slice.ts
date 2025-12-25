import { StateCreator } from "zustand";
import { spotifyService } from "@/services/spotify.service";

export interface PlaylistState {
  playlists: string[];
  inputValue: string;
  activePlaylistIndex: number | null;
  genres: string[];
  selectedGenres: string[];
}

export interface PlaylistActions {
  setInputValue: (value: string) => void;
  addPlaylist: () => void;
  removePlaylist: (index: number) => void;
  setActivePlaylist: (index: number) => void;
  fetchGenres: () => Promise<void>;
  toggleGenre: (genre: string) => void;
}

export type PlaylistSlice = PlaylistState & PlaylistActions;

export const createPlaylistSlice: StateCreator<
  PlaylistSlice,
  [],
  [],
  PlaylistSlice
> = (set, get) => ({
  // State
  playlists: [],
  inputValue: "",
  activePlaylistIndex: null,
  genres: [],
  selectedGenres: [],

  // Actions
  setInputValue: (value) => set({ inputValue: value }),

  addPlaylist: () => {
    const { inputValue, playlists, activePlaylistIndex } = get();
    if (!inputValue.trim()) return;

    const newPlaylists = [...playlists, inputValue.trim()];
    set({
      playlists: newPlaylists,
      inputValue: "",
      activePlaylistIndex:
        newPlaylists.length === 1 && activePlaylistIndex === null
          ? 0
          : activePlaylistIndex,
    });
  },

  removePlaylist: (index) => {
    const { playlists, activePlaylistIndex } = get();
    const newPlaylists = playlists.filter((_, i) => i !== index);

    let newActiveIndex = activePlaylistIndex;
    if (activePlaylistIndex === index) {
      newActiveIndex = newPlaylists.length > 0 ? 0 : null;
    } else if (activePlaylistIndex !== null && index < activePlaylistIndex) {
      newActiveIndex = activePlaylistIndex - 1;
    }

    set({ playlists: newPlaylists, activePlaylistIndex: newActiveIndex });
  },

  setActivePlaylist: (index) => set({ activePlaylistIndex: index }),

  fetchGenres: async () => {
    const { playlists, activePlaylistIndex } = get();
    if (!playlists.length) return;

    try {
      const playlistId = playlists[activePlaylistIndex ?? 0];
      const genreData = await spotifyService.getPlaylistGenres(playlistId);
      set({ genres: genreData, selectedGenres: [] });
    } catch (error) {
      console.error("Error fetching genres:", error);
    }
  },

  toggleGenre: (genre) => {
    const { selectedGenres } = get();
    set({
      selectedGenres: selectedGenres.includes(genre)
        ? selectedGenres.filter((g) => g !== genre)
        : [...selectedGenres, genre],
    });
  },
});

