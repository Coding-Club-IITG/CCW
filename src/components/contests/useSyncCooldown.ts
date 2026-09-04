"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Countdown that throttles submission syncing,
 * restored from localStorage so a reload cannot shorten it
 */
export function useSyncCooldown(
  roomId: string,
  userId: string,
  cooldownSeconds: number,
) {
  const [cooldown, setCooldown] = useState(0);
  const storageKey = `sync_${roomId}_${userId}`;

  useEffect(() => {
    const lastSyncStr = localStorage.getItem(storageKey);
    if (!lastSyncStr) return;
    const elapsed = (Date.now() - parseInt(lastSyncStr, 10)) / 1000;
    if (elapsed > 0 && elapsed < cooldownSeconds) {
      setCooldown(Math.ceil(cooldownSeconds - elapsed));
    }
  }, [cooldownSeconds, storageKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Holds the button before the request goes out
  const hold = useCallback(
    () => setCooldown(cooldownSeconds),
    [cooldownSeconds],
  );

  // Records the sync so the cooldown survives a reload
  const begin = useCallback(() => {
    setCooldown(cooldownSeconds);
    localStorage.setItem(storageKey, Date.now().toString());
  }, [cooldownSeconds, storageKey]);

  return { cooldown, hold, begin };
}
