"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Music } from "lucide-react";
import env from "@/config/env";

export const WebSocketListener = () => {
  const {
    scrapes,
    activeScrapes,
    wsStatus,
    addScrapeResponse,
    toggleActiveScrape,
    setWsStatus,
  } = useAppStore();

  useEffect(() => {
    const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_API);

    socket.addEventListener("open", () => setWsStatus("Connected"));
    socket.addEventListener("close", () => setWsStatus("Disconnected"));
    socket.addEventListener("error", () => setWsStatus("Error"));

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id) {
          addScrapeResponse(data);
        }
      } catch (e) {}
    });

    return () => socket.close();
  }, [addScrapeResponse, setWsStatus]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Artist Pools</h2>
        <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1">
          <div
            className={`h-2 w-2 rounded-full ${wsStatus === "Connected" ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-gray-500">{wsStatus}</span>
        </div>
      </div>

      {scrapes?.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scrapes.map(({ id, seed_artist, total_artists, depth }) => (
            <Card key={id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium truncate">{seed_artist}</span>
                <Checkbox
                  checked={activeScrapes?.includes(id)}
                  onCheckedChange={(checked) =>
                    toggleActiveScrape(id, checked as boolean)
                  }
                />
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>ID: {id}</div>
                <div className="flex justify-between">
                  <span>{total_artists} Artists</span>
                  <span>Depth {depth}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center">
          <Music className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No responses yet</p>
        </Card>
      )}
    </div>
  );
};
