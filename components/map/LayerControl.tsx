"use client";

import { useMapStore } from "@/lib/store";
import type { LayerType } from "@/types";

const LAYERS: { id: LayerType; label: string; icon: string }[] = [
  { id: "price", label: "価格", icon: "💴" },
  { id: "crime", label: "治安", icon: "🚨" },
  { id: "hazard", label: "災害", icon: "🌊" },
];

export default function LayerControl() {
  const { activeLayer, setActiveLayer } = useMapStore();

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex bg-white rounded-full shadow-lg border border-gray-200 overflow-hidden">
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
  );
}
