"use client";
import { Music2, Loader2, ListMusic } from "lucide-react";
import { useAppStore } from "@/store/app.store";

export const DiscoveryView = () => {
  const {
    isScraping,
    isLoadingTracks,
    discoveryPlaylists,
    tracks,
    discoveryLimit,
    discoveryView,
    activeTrackPopup,
    setDiscoveryLimit,
    scrapePlaylists,
    fetchTracks,
    createPlaylist,
    setDiscoveryView,
    toggleTrackPopup,
  } = useAppStore();

  const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setDiscoveryLimit(value);
    }
  };

  const openSpotify = (trackId: string) => {
    window.location.href = `spotify:track:${trackId}`;
  };

  return (
    <div className="p-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl mb-4">Music Discovery</h2>

          {/* Controls */}
          <div className="flex gap-4 items-center flex-wrap mb-6">
            <div className="flex items-center gap-2">
              <label htmlFor="limit" className="text-sm">
                Number of playlists:
              </label>
              <input
                id="limit"
                type="number"
                min="1"
                value={discoveryLimit}
                onChange={handleLimitChange}
                className="w-20 border rounded px-2 py-1"
              />
            </div>
            <button
              onClick={scrapePlaylists}
              disabled={isScraping}
              className="bg-blue-600 text-white p-2 rounded disabled:opacity-50"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Music2 className="w-4 h-4 inline mr-2" />
                  Find Playlists
                </>
              )}
            </button>
            <button
              onClick={fetchTracks}
              disabled={isLoadingTracks}
              className="bg-green-600 text-white p-2 rounded disabled:opacity-50"
            >
              {isLoadingTracks ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading Tracks...
                </>
              ) : (
                <>
                  <ListMusic className="w-4 h-4 inline mr-2" />
                  Load Tracks
                </>
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <div className="flex gap-4">
              <button
                onClick={() => setDiscoveryView("playlists")}
                className={`pb-2 px-1 ${
                  discoveryView === "playlists"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Music2 className="w-4 h-4 inline mr-2" />
                Playlists{" "}
                {discoveryPlaylists.length > 0 &&
                  `(${discoveryPlaylists.length})`}
              </button>
              <button
                onClick={() => setDiscoveryView("tracks")}
                className={`pb-2 px-1 ${
                  discoveryView === "tracks"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ListMusic className="w-4 h-4 inline mr-2" />
                Tracks {tracks.length > 0 && `(${tracks.length})`}
              </button>
            </div>
          </div>

          {/* Playlists View */}
          {discoveryView === "playlists" &&
            (discoveryPlaylists.length === 0 ? (
              <div className="text-center p-8">
                <Music2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>Start your search to discover playlists</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {discoveryPlaylists.map((playlist) => (
                  <div key={playlist.uri} className="bg-white rounded shadow">
                    <img
                      src={playlist.cover_art || "/api/placeholder/400/400"}
                      alt={playlist.name}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="p-2">
                      <h3 className="font-medium truncate">{playlist.name}</h3>
                      <a href={playlist.uri} className="text-blue-600">
                        Open in Spotify
                      </a>
                      <div>saves: {playlist.saves}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* Tracks View */}
          {discoveryView === "tracks" &&
            (tracks.length === 0 ? (
              <div className="text-center p-8">
                <ListMusic className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No tracks match your filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <button onClick={createPlaylist}>Create playlist</button>
                {tracks.map((track) => (
                  <div className="relative" key={track.id}>
                    <div
                      className="bg-gradient-to-r from-gray-400 to-black p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-4 cursor-pointer"
                      onClick={() => toggleTrackPopup(track.id)}
                    >
                      <img
                        src={
                          track?.coverArt?.sources?.[0]?.url ??
                          "/api/placeholder/64/64"
                        }
                        alt={track?.name ?? "Track artwork"}
                        className="w-16 h-16 object-cover rounded-lg shadow-md"
                      />
                      <div>
                        <h4 className="font-bold text-white">{track.name}</h4>
                        <p className="text-sm text-gray-300">
                          {track.artists?.map((a) => a.name).join(", ")}
                        </p>
                      </div>
                    </div>

                    {activeTrackPopup === track.id && (
                      <div className="absolute z-10 top-full left-0 mt-2 w-full bg-gray-800 rounded-lg shadow-xl p-4">
                        <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                          <span>{track.playcount} Streams</span>
                          <button
                            className="text-gray-400 hover:text-white"
                            onClick={() => toggleTrackPopup(track.id)}
                          >
                            ✕
                          </button>
                        </div>

                        {track.genres?.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-sm text-gray-300 mb-1">
                              Genres:
                            </h5>
                            <div className="flex flex-wrap gap-1">
                              {track.genres.map((genre, i) => (
                                <span
                                  key={i}
                                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-900 text-indigo-200"
                                >
                                  {genre}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSpotify(track.id);
                          }}
                        >
                          Open in Spotify
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
