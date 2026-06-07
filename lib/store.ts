import { create } from "zustand";
import type { LayerType, AreaScore } from "@/types";

export type HazardType = "flood" | "landslide" | "tsunami";

interface MapStore {
  activeLayer: LayerType;
  setActiveLayer: (layer: LayerType) => void;
  selectedArea: AreaScore | null;
  setSelectedArea: (area: AreaScore | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showCrimePoints: boolean;
  toggleCrimePoints: () => void;
  activeHazards: Set<HazardType>;
  toggleHazard: (h: HazardType) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  activeLayer: "price",
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  selectedArea: null,
  setSelectedArea: (area) => set({ selectedArea: area }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  showCrimePoints: false,
  toggleCrimePoints: () => set((s) => ({ showCrimePoints: !s.showCrimePoints })),
  activeHazards: new Set<HazardType>(["flood"]),
  toggleHazard: (h) =>
    set((s) => {
      const next = new Set(s.activeHazards);
      next.has(h) ? next.delete(h) : next.add(h);
      return { activeHazards: next };
    }),
}));
