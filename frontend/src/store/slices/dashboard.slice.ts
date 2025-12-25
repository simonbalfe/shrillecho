import { StateCreator } from "zustand";
import { DashboardView } from "../types";

export interface DashboardState {
  dashboardView: DashboardView;
}

export interface DashboardActions {
  setDashboardView: (view: DashboardView) => void;
}

export type DashboardSlice = DashboardState & DashboardActions;

export const createDashboardSlice: StateCreator<
  DashboardSlice,
  [],
  [],
  DashboardSlice
> = (set) => ({
  // State
  dashboardView: "artists",

  // Actions
  setDashboardView: (view) => set({ dashboardView: view }),
});

