"use client";

import { useEffect, useState } from "react";

import { formatRemainingTime } from "@/components/contests/roomPresentation";

export type RoomMatchState = "waiting" | "active" | "completed";

/** Returns the remaining time until an absolute epoch-millisecond deadline. */
export function useCountdownTo(deadlineMs?: number): string {
  const [timeLeft, setTimeLeft] = useState("00:00");

  useEffect(() => {
    if (!deadlineMs) {
      setTimeLeft("00:00");
      return;
    }

    const update = () => {
      setTimeLeft(formatRemainingTime((deadlineMs - Date.now()) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  return timeLeft;
}

export function useRoomCountdown(
  matchState: RoomMatchState,
  startTime?: number,
  timeLimit?: number,
): string {
  const activeCountdown = useCountdownTo(
    matchState === "active" && startTime && timeLimit
      ? startTime + timeLimit * 1000
      : undefined,
  );

  if (matchState !== "active" || !startTime || !timeLimit) {
    return matchState === "completed" || !timeLimit
      ? "00:00"
      : formatRemainingTime(timeLimit);
  }

  return activeCountdown;
}
