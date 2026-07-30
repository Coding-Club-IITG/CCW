"use client";

import { useEffect, useState } from "react";

import { formatRemainingTime } from "@/components/contests/roomPresentation";

export type RoomMatchState = "waiting" | "active" | "completed";

export function useRoomCountdown(
  matchState: RoomMatchState,
  startTime?: number,
  timeLimit?: number,
): string {
  const [timeLeft, setTimeLeft] = useState("00:00");

  useEffect(() => {
    if (matchState !== "active" || !startTime || !timeLimit) {
      setTimeLeft(
        matchState === "completed" || !timeLimit
          ? "00:00"
          : formatRemainingTime(timeLimit),
      );
      return;
    }

    const endTime = startTime + timeLimit * 1000;
    const updateTimeLeft = () => {
      setTimeLeft(formatRemainingTime((endTime - Date.now()) / 1000));
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [matchState, startTime, timeLimit]);

  return timeLeft;
}
