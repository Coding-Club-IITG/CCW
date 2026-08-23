"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/lib/store/theme";
import { CommandConsoleProvider } from "@/components/atlas/CommandConsole";

export default function Providers({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <CommandConsoleProvider>{children}</CommandConsoleProvider>;
}
