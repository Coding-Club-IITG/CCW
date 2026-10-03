"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomActivityDto } from "@/lib/contests/dtos";
import { useToast } from "@/components/shared/Toast";
import { sendBrowserNotification } from "./roomNotification";

export function mergeRoomActivity(
  previous: RoomActivityDto[],
  incoming: RoomActivityDto[],
) {
  return [
    ...new Map(
      [...previous, ...incoming].map((entry) => [entry.id, entry]),
    ).values(),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);
}

export function useRoomActivity(
  initial: RoomActivityDto[],
  workspaceOpen: boolean,
) {
  const [entries, setEntries] = useState(() => mergeRoomActivity([], initial));
  const seen = useRef(new Set(initial.map((entry) => entry.id)));
  const [unread, setUnread] = useState(0);
  const [activityVisible, setActivityVisible] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!workspaceOpen || activityVisible) setUnread(0);
  }, [workspaceOpen, activityVisible]);

  const snapshot = (history: RoomActivityDto[]) => {
    for (const entry of history) seen.current.add(entry.id);
    setEntries((previous) => mergeRoomActivity(previous, history));
  };
  const receive = (entry: RoomActivityDto, alertSolve = true) => {
    if (seen.current.has(entry.id)) return;
    seen.current.add(entry.id);
    setEntries((previous) => mergeRoomActivity(previous, [entry]));
    if (workspaceOpen && !activityVisible) setUnread((count) => count + 1);
    sendBrowserNotification(entry.icon, entry.text);
    if (alertSolve && ["check_circle", "lock", "gavel"].includes(entry.icon))
      toast.success(entry.text);
  };
  const add = (icon: string, text: string, color = "text-on-surface") =>
    receive(
      {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        icon,
        text,
        color,
      },
      false,
    );
  const onTabChange = useCallback(
    (tab: string) => setActivityVisible(tab === "activity"),
    [],
  );
  return {
    entries,
    unread,
    snapshot,
    receive,
    add,
    onTabChange,
  };
}
