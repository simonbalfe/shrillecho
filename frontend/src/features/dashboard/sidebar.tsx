"use client";
import { ChevronDown } from "lucide-react";
import { useAppStore } from "@/store/app.store";
import { PlaylistInput } from "@/features/playlists/playlist-input";
import { PlaylistList } from "@/features/playlists/playlist-list";

export const Sidebar = () => {
  const {
    genres,
    selectedGenres,
    activePlaylistIndex,
    fetchGenres,
    toggleGenre,
  } = useAppStore();

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-zinc-900 rounded-xl shadow-xl overflow-hidden border border-zinc-800">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-xl font-medium text-zinc-100">Playlists</h2>
        </div>
        <div className="p-6 space-y-6">
          <PlaylistInput />
          <PlaylistList />

          <button
            onClick={fetchGenres}
            disabled={activePlaylistIndex === null}
            className={`w-full mt-4 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 rounded-lg transition-colors ${
              activePlaylistIndex === null
                ? "bg-zinc-800/50 text-zinc-500 cursor-not-allowed border border-zinc-800"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
            }`}
          >
            <span>
              Analyze Genres
              {activePlaylistIndex !== null ? ` for Selected Playlist` : ``}
            </span>
            <ChevronDown size={16} />
          </button>

          {genres.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Genres ({genres.length})
              </h3>
              <div className="relative w-full">
                <div className="max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-800">
                  <div className="flex flex-wrap gap-2 w-full">
                    {genres.map((genre, index) => (
                      <button
                        key={index}
                        onClick={() => toggleGenre(genre)}
                        className={`px-3 py-1 rounded-full text-xs transition-all ${
                          selectedGenres.includes(genre)
                            ? "bg-zinc-700 text-zinc-200 border border-zinc-600"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
