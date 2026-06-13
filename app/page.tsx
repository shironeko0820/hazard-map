import dynamic from "next/dynamic";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import LayerControl from "@/components/map/LayerControl";

// MapLibreはSSR非対応のためdynamic importでclient-onlyにする
const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden max-w-full">
      <Header />
      <div className="flex flex-1 overflow-hidden min-w-0">
        {/* 地図エリア */}
        <div className="flex-1 relative">
          <MapView />
          <LayerControl />
        </div>

        {/* サイドパネル */}
        <Sidebar />
      </div>
    </div>
  );
}
