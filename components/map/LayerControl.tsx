"use client";

import { useMapStore } from "@/lib/store";
import type { LayerType } from "@/types";
import type { HazardType } from "@/lib/store";

const LAYERS: { id: LayerType; label: string; icon: string }[] = [
  { id: "price", label: "価格", icon: "💴" },
  { id: "crime", label: "治安", icon: "🚨" },
  { id: "hazard", label: "災害", icon: "🌊" },
];

const HAZARD_TYPES: { id: HazardType; label: string; color: string }[] = [
  { id: "flood",     label: "洪水",   color: "bg-blue-500" },
  { id: "landslide", label: "土砂災害", color: "bg-orange-500" },
  { id: "tsunami",   label: "津波",   color: "bg-purple-500" },
];

export default function LayerControl() {
  const {
    activeLayer, setActiveLayer,
    showCrimePoints, toggleCrimePoints,
    activeHazards, toggleHazard,
  } = useMapStore();

  return (
    <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">

      {/* 犯罪地点表示ボタン */}
      <button
        onClick={toggleCrimePoints}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full shadow-lg border transition-colors ${
          showCrimePoints
            ? "bg-red-600 text-white border-red-600"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        <span>📍</span>
        <span>犯罪地点を{showCrimePoints ? "非表示" : "表示"}</span>
      </button>

      {/* 災害サブトグル（災害タブ選択時のみ表示）*/}
      {activeLayer === "hazard" && (
        <div className="flex bg-white rounded-full shadow-lg border border-gray-200 overflow-hidden">
          {HAZARD_TYPES.map((h) => (
            <button
              key={h.id}
              onClick={() => toggleHazard(h.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                activeHazards.has(h.id)
                  ? `${h.color} text-white`
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span>{h.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* メインレイヤー切替 */}
      <div className="flex bg-white rounded-full shadow-lg border border-gray-200 overflow-hidden">
        {LAYERS.map((layer) => (
          <button
            key={layer.id}
            onClick={() => setActiveLayer(layer.id)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${
              activeLayer === layer.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>{layer.icon}</span>
            <span>{layer.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
