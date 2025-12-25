import { create } from "zustand";
import {
  createAuthSlice,
  createDashboardSlice,
  createPlaylistSlice,
  createArtistScrapingSlice,
  createDiscoverySlice,
  AuthSlice,
  DashboardSlice,
  PlaylistSlice,
  ArtistScrapingSlice,
  DiscoverySlice,
} from "./slices";

export type AppStore = AuthSlice &
  DashboardSlice &
  PlaylistSlice &
  ArtistScrapingSlice &
  DiscoverySlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createDashboardSlice(...a),
  ...createPlaylistSlice(...a),
  ...createArtistScrapingSlice(...a),
  ...createDiscoverySlice(...a),
}));
