"use client";
import { useAppStore } from "@/store/app.store";

export const ArtistGrid = () => {
  const { artistInput, setArtistInput, depth, setDepth, isScraping, scrapeArtists } =
    useAppStore();

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-col gap-3 w-full max-w-xs mb-8">
        <input
          type="text"
          value={artistInput}
          onChange={(e) => setArtistInput(e.target.value)}
          placeholder="Enter Artist ID"
          className="px-3 py-2 border rounded"
        />
        <input
          type="number"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
          placeholder="Depth"
          min="1"
          max="3"
          className="px-3 py-2 border rounded"
        />
        <button
          onClick={scrapeArtists}
          disabled={isScraping || !artistInput}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 transition-colors"
        >
          {isScraping ? "Collecting..." : "Collect artist pool"}
        </button>
      </div>
    </div>
  );
};
