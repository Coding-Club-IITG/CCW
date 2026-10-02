"use client";

import { useEffect, useRef } from "react";

import type { RoomEventPayloadDto } from "@/lib/contests/dtos";
import { parseRoomStreamMessage } from "@/lib/contests/roomStream";

export function useRoomEventSource(
  roomId: string,
  userId: string,
  onEvent: (payload: RoomEventPayloadDto) => void,
) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/contests/stream?roomId=${roomId}`,
    );

    eventSource.onmessage = (event) => {
      try {
        const data: unknown = JSON.parse(event.data);
        const payload = parseRoomStreamMessage(data, roomId, userId);

        if (payload) onEventRef.current(payload);
      } catch {
        // Ignore malformed events and keep the stream connected.
      }
    };

    return () => eventSource.close();
  }, [roomId, userId]);
}
