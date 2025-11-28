import { create } from "zustand";

type BBox = { w: number; s: number; e: number; n: number };

type MapState = {
  center: { lat: number; lon: number } | null;
  bbox: BBox | null;
  setCenter: (lat: number, lon: number) => void;
  setBBox: (bbox: BBox) => void;
};

export const useMapState = create<MapState>((set) => ({
  center: null,
  bbox: null,
  setCenter: (lat, lon) => set({ center: { lat, lon } }),
  setBBox: (bbox) => set({ bbox }),
}));