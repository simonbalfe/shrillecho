"use client";
import { useAppStore } from "@/store/app.store";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { ArtistView } from "@/features/artist-scraping";
import { DiscoveryView } from "@/features/discovery";
import { WebSocketListener } from "@/features/artist-scraping/websocket-listener";

export const Dashboard = () => {
  const { dashboardView, setDashboardView } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header view={dashboardView} onViewChange={setDashboardView} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-[350px,1fr] gap-6">
          <aside>
            <Sidebar />
          </aside>
          <main>
            {dashboardView === "artists" ? <ArtistView /> : <DiscoveryView />}
          </main>
        </div>
      </div>
      <div className="fixed bottom-4 right-4 max-w-sm">
        <WebSocketListener />
      </div>
    </div>
  );
};
