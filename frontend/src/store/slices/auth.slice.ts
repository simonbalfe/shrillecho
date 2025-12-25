import { StateCreator } from "zustand";
import { userService } from "@/services/user.service";
import { checkForCookie } from "@/utils/cookies";

export interface AuthState {
  isLoading: boolean;
  hasSession: boolean;
}

export interface AuthActions {
  checkSession: () => void;
  registerAnonymousUser: () => Promise<void>;
}

export type AuthSlice = AuthState & AuthActions;

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (
  set
) => ({
  // State
  isLoading: false,
  hasSession: true,

  // Actions
  checkSession: () => {
    set({ hasSession: checkForCookie() });
  },

  registerAnonymousUser: async () => {
    set({ isLoading: true });
    try {
      await userService.registerAnonymousUser();
      set({ hasSession: true });
    } catch (error) {
      console.error("Error:", error);
      set({ hasSession: false });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
});

