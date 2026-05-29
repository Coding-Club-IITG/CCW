import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme:
    (typeof window !== "undefined" &&
      (localStorage.getItem("theme") as Theme)) ||
    "light",
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
}));
