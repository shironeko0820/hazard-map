import { create } from "zustand";
import type { LayerType, AreaScore } from "@/types";

interface MapStore {
  activeLayer: LayerType;
  setActiveLayer: (layer: LayerType) => void;
  selectedArea: AreaScore | null;
  setSelectedArea: (area: AreaScore | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  activeLayer: "price",
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  selectedArea: null,
  setSelectedArea: (area) => set({ selectedArea: area }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
