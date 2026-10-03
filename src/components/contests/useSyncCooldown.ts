"use client";

import { useCallback, useEffect, useState } from "react";

import { CONTEST_TIMING } from "@/lib/constants";

// Absolute deadlines stay accurate when a background tab skips timer ticks
export function useSyncCooldown(
  roomId: string,
  userId: string,
  cooldownSeconds: number,
) {
  const [deadline, setDeadline] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const storageKey = `sync_${roomId}_${userId}`;

  useEffect(() => {
    const restore = () => {
      let lastSync = 0;
      try {
        lastSync = Number(localStorage.getItem(storageKey));
      } catch {
        /* The in-memory cooldown still applies when storage is unavailable. */
      }
      setDeadline(
        Number.isFinite(lastSync) && lastSync > 0
          ? lastSync + cooldownSeconds * 1000
          : 0,
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) restore();
    };

    restore();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [cooldownSeconds, storageKey]);

  useEffect(() => {
    const refresh = () =>
      setCooldown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    refresh();
    if (deadline <= Date.now()) return;

    const timer = setInterval(() => {
      refresh();
      if (deadline <= Date.now()) clearInterval(timer);
    }, CONTEST_TIMING.displayRefreshMs);
    return () => clearInterval(timer);
  }, [deadline]);

  const hold = useCallback(() => {
    setCooldown(cooldownSeconds);
    setDeadline(Date.now() + cooldownSeconds * 1000);
  }, [cooldownSeconds]);

  const begin = useCallback(() => {
    hold();
    try {
      localStorage.setItem(storageKey, Date.now().toString());
    } catch {
      /* Keep the in-memory deadline */
    }
  }, [hold, storageKey]);

  return { cooldown, hold, begin };
}
