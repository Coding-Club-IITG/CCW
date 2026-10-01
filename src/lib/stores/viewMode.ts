import { create } from "zustand";

type ViewMode = "internal" | "public";

interface ViewModeState {
  viewMode: ViewMode;
  toggleViewMode: () => void;
  setViewMode: (mode: ViewMode) => void;
}

function setViewModeCookie(mode: ViewMode) {
  document.cookie = `viewMode=${mode};path=/;max-age=31536000;SameSite=Lax`;
}

function getInitialViewMode(): ViewMode {
  if (typeof document === "undefined") return "internal";
  const match = document.cookie.match(/(?:^|; )viewMode=(internal|public)/);
  return (match?.[1] as ViewMode) ?? "internal";
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  viewMode: getInitialViewMode(),
  toggleViewMode: () =>
    set((state) => {
      const next = state.viewMode === "internal" ? "public" : "internal";
      setViewModeCookie(next);
      return { viewMode: next };
    }),
  setViewMode: (viewMode) => {
    setViewModeCookie(viewMode);
    set({ viewMode });
  },
}));
