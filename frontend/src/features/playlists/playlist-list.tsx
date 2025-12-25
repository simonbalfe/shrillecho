"use client";
import { CheckCircle, X } from "lucide-react";
import { useAppStore } from "@/store/app.store";

export const PlaylistList = () => {
  const { playlists, activePlaylistIndex, setActivePlaylist, removePlaylist } =
    useAppStore();

  if (playlists.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Your Playlists ({playlists.length})
        </h3>
      </div>
      <div className="space-y-2">
        {playlists.map((playlist, index) => (
          <div
            key={index}
            className={`flex items-center justify-between p-3 rounded-lg group 
                transition-colors border ${
                  activePlaylistIndex === index
                    ? "bg-zinc-700 border-zinc-600"
                    : "bg-zinc-800 hover:bg-zinc-750 border-zinc-700"
                }`}
          >
            <div
              className="flex items-center flex-1 cursor-pointer"
              onClick={() => setActivePlaylist(index)}
            >
              {activePlaylistIndex === index && (
                <CheckCircle
                  size={16}
                  className="text-green-500 mr-2 flex-shrink-0"
                />
              )}
              <span
                className={`text-sm break-all ${
                  activePlaylistIndex === index
                    ? "text-zinc-200"
                    : "text-zinc-400"
                }`}
              >
                {playlist}
              </span>
            </div>
            <button
              onClick={() => removePlaylist(index)}
              className="ml-2 text-zinc-500 hover:text-zinc-300 p-1 rounded-full transition-all"
              aria-label="Remove playlist"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
