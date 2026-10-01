import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

function setThemeCookie(theme: Theme) {
  document.cookie = `theme=${theme};path=/;max-age=31536000;SameSite=Lax`;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const cookieMatch = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  if (cookieMatch) return cookieMatch[1] as Theme;
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored) {
    setThemeCookie(stored);
    return stored;
  }
  return "dark";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      setThemeCookie(next);
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
}));
