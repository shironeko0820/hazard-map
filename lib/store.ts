import { create } from "zustand";
import type { LayerType, AreaScore, MonumentProperties } from "@/types";

export type HazardType = "flood" | "landslide" | "tsunami" | "earthquake";

export interface MapCenter {
  lat: number;
  lng: number;
  zoom?: number;
}

interface MapStore {
  activeLayer: LayerType;
  setActiveLayer: (layer: LayerType) => void;
  selectedArea: AreaScore | null;
  setSelectedArea: (area: AreaScore | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showCrimeChoropleth: boolean;
  toggleCrimeChoropleth: () => void;
  activeHazards: Set<HazardType>;
  toggleHazard: (h: HazardType) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  selectedMonument: MonumentProperties | null;
  setSelectedMonument: (m: MonumentProperties | null) => void;
  mapCenter: MapCenter | null;
  setMapCenter: (center: MapCenter) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  activeLayer: "price",
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  selectedArea: null,
  setSelectedArea: (area) => set({ selectedArea: area }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  showCrimeChoropleth: true,
  toggleCrimeChoropleth: () => set((s) => ({ showCrimeChoropleth: !s.showCrimeChoropleth })),
  activeHazards: new Set<HazardType>(["flood"]),
  toggleHazard: (h) =>
    set((s) => {
      const next = new Set(s.activeHazards);
      if (h === "earthquake") {
        // 地震は単独表示（洪水/土砂/津波と同時表示しない）
        if (next.has("earthquake")) {
          next.delete("earthquake");
        } else {
          next.clear();
          next.add("earthquake");
        }
      } else {
        // 洪水/土砂/津波 → 地震を解除してからトグル
        next.delete("earthquake");
        next.has(h) ? next.delete(h) : next.add(h);
      }
      return { activeHazards: next, showHistory: false };
    }),
  showHistory: false,
  setShowHistory: (v) =>
    set(() => ({
      showHistory: v,
      // 過去の被害ON時は将来リスクをデフォルト（洪水）に戻す
      activeHazards: v ? new Set<HazardType>(["flood"]) : new Set<HazardType>(["flood"]),
    })),
  selectedMonument: null,
  setSelectedMonument: (m) => set({ selectedMonument: m }),
  mapCenter: null,
  setMapCenter: (center) => set({ mapCenter: center }),
}));
