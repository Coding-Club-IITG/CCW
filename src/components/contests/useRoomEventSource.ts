"use client";

import { useEffect, useRef } from "react";
import type { RoomEventPayloadDto } from "@/lib/contests/dtos";
import { roomStreamEventSchema } from "@/lib/contests/runtime";

export function useRoomEventSource(
  roomId: string,
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
        if (data && typeof data === "object" && "payload" in data) {
          const result = roomStreamEventSchema.safeParse(data.payload);
          if (result.success) {
            onEventRef.current(result.data);
          }
        }
      } catch {
        // Ignore malformed events and keep the stream connected.
      }
    };

    return () => eventSource.close();
  }, [roomId]);
}
