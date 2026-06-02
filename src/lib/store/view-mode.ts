import { create } from "zustand";

type ViewMode = "internal" | "public";

interface ViewModeState {
  viewMode: ViewMode;
  toggleViewMode: () => void;
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  viewMode: "internal",
  toggleViewMode: () =>
    set((state) => ({
      viewMode: state.viewMode === "internal" ? "public" : "internal",
    })),
}));
