export const parseSpotifyId = (url: string): string => {
  try {
    const playlistPath = url.split("/playlist/")[1];
    if (!playlistPath) return "";
    return playlistPath.split("?")[0] || "";
  } catch {
    return "";
  }
};

