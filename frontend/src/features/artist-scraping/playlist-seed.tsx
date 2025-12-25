"use client";
import { useAppStore } from "@/store/app.store";

export const PlaylistSeed = () => {
  const { isScraping, scrapePlaylistSeed } = useAppStore();

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-col gap-3 w-full max-w-xs mb-8">
        <p>
          This uses your playlists you entered to seed the scrape using a subset
          of artists from it
        </p>
        <button
          onClick={scrapePlaylistSeed}
          disabled={isScraping}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 transition-colors"
        >
          {isScraping ? "Collecting..." : "Collect artist pool from playlists"}
        </button>
      </div>
    </div>
  );
};
