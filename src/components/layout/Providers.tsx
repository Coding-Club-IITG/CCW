"use client";

import { createContext, useContext, useEffect } from "react";

import { useThemeStore } from "@/lib/stores/theme";

import { CommandConsoleProvider } from "@/components/atlas/CommandConsole";
import { ToastProvider } from "@/components/shared/Toast";

export interface RuntimeConfig {
  developmentAuthEnabled: boolean;
  googleAuthEnabled: boolean;
  userRateLimitsEnabled: boolean;
  contestDisplayRefreshMilliseconds: number;
  contestResultRedirectSeconds: number;
}

const RuntimeConfigContext = createContext<RuntimeConfig>({
  developmentAuthEnabled: false,
  googleAuthEnabled: false,
  userRateLimitsEnabled: true,
  contestDisplayRefreshMilliseconds: 1000,
  contestResultRedirectSeconds: 2,
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
      <ToastProvider>
        <CommandConsoleProvider>{children}</CommandConsoleProvider>
      </ToastProvider>
    </RuntimeConfigContext>
  );
}
