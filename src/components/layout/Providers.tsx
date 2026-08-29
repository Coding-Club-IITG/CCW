"use client";

import { createContext, useContext, useEffect } from "react";
import { useThemeStore } from "@/lib/store/theme";
import { CommandConsoleProvider } from "@/components/atlas/CommandConsole";

export interface RuntimeConfig {
  developmentAuthEnabled: boolean;
  userRateLimitsEnabled: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfig>({
  developmentAuthEnabled: false,
  userRateLimitsEnabled: true,
});

export const useRuntimeConfig = () => useContext(RuntimeConfigContext);

export default function Providers({
  children,
  runtimeConfig,
}: {
  children: React.ReactNode;
  runtimeConfig: RuntimeConfig;
}) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <RuntimeConfigContext value={runtimeConfig}>
      <CommandConsoleProvider>{children}</CommandConsoleProvider>
    </RuntimeConfigContext>
  );
}
