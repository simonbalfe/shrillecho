"use client";
import { ArtistGrid } from "./artist-grid";
import { PlaylistSeed } from "./playlist-seed";

export const ArtistView = () => {
  return (
    <div className="space-y-6">
      <ArtistGrid />
      <PlaylistSeed />
    </div>
  );
};

export { WebSocketListener } from "./websocket-listener";
export { ArtistGrid } from "./artist-grid";
export { PlaylistSeed } from "./playlist-seed";
