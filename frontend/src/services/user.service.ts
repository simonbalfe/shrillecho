import { api } from "./api";
import { supabase } from "./supabase";
import { setCookie } from "@/utils/cookies";

export const userService = {
  registerAnonymousUser: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.session) throw new Error("No session created");

    setCookie(data.session.access_token);

    try {
      const responseData = await api.post("/users");
      return { session: data.session, user: responseData };
    } catch (backendError) {
      await supabase.auth.signOut();
      throw backendError;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },
};

