"use client";

import { useEffect, useState } from "react";

import { CONTEST_TIMING } from "@/lib/constants";

import { readAppResult } from "@/lib/api/result";
import type { ParticipationResult } from "@/lib/contests/participation";
import type { RoomStreamEvent } from "@/lib/contests/runtime";

import type { RoomMatchState } from "@/components/contests/useRoomCountdown";

export function useRoomParticipation({
  roomId,
  userId,
  matchState,
  initialReadyUserIds,
  initialAdmittedUserIds,
  initialReadyOpensAt,
  initialReadyDeadline,
}: {
  roomId: string;
  userId: string;
  matchState: RoomMatchState;
  initialReadyUserIds: string[];
  initialAdmittedUserIds: string[];
  initialReadyOpensAt?: number;
  initialReadyDeadline?: number;
}) {
  const [readyUserIds, setReadyUserIds] = useState(
    new Set(initialReadyUserIds),
  );
  const [admittedUserIds, setAdmittedUserIds] = useState(
    new Set(initialAdmittedUserIds),
  );
  const [readyOpensAt, setReadyOpensAt] = useState(initialReadyOpensAt);
  const [readyDeadline, setReadyDeadline] = useState(initialReadyDeadline);
  const [now, setNow] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);
  const [entryError, setEntryError] = useState("");

  useEffect(() => {
    if (matchState !== "waiting") return;

    setNow(Date.now());

    const interval = setInterval(
      () => setNow(Date.now()),
      CONTEST_TIMING.displayRefreshMs,
    );

    return () => clearInterval(interval);
  }, [matchState]);

  function syncParticipation(
    event: Extract<RoomStreamEvent, { type: "room.state_sync" }>,
  ) {
    if (event.readyUserIds) setReadyUserIds(new Set(event.readyUserIds));
    if (event.admittedUserIds)
      setAdmittedUserIds(new Set(event.admittedUserIds));
    if (event.state.readyOpensAt)
      setReadyOpensAt(Number(event.state.readyOpensAt));
    if (event.state.readyDeadline)
      setReadyDeadline(Number(event.state.readyDeadline));
  }

  async function handleReady() {
    setEntering(true);
    setEntryError("");

    try {
      const response = await fetch(`/api/contests/rooms/${roomId}/ready`, {
        method: "POST",
      });
      const result = await readAppResult<ParticipationResult>(response);

      if (!result.ok) {
        setEntryError(result.error.message);
        return;
      }

      setReadyUserIds(new Set(result.data.readyUserIds));
      setAdmittedUserIds(new Set(result.data.admittedUserIds));
    } catch {
      setEntryError("Could not enter the match. Please try again.");
    } finally {
      setEntering(false);
    }
  }

  return {
    readyUserIds,
    setReadyUserIds,
    admittedUserIds,
    syncParticipation,
    handleReady,
    isReady: readyUserIds.has(userId),
    isAdmitted: admittedUserIds.has(userId),
    readySecondsLeft:
      readyDeadline && now !== null
        ? Math.max(0, Math.ceil((readyDeadline - now) / 1000))
        : null,
    opensInSeconds: readyOpensAt
      ? now === null
        ? 1
        : Math.max(0, Math.ceil((readyOpensAt - now) / 1000))
      : 0,
    entering,
    entryError,
  };
}
