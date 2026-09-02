"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomEventPayloadDto } from "@/lib/contests/dtos";
import { roomStreamEventSchema } from "@/lib/contests/runtime";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export function useRoomEventSource(
  roomId: string,
  onEvent: (payload: RoomEventPayloadDto) => void,
): ConnectionStatus {
  const onEventRef = useRef(onEvent);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let cancelled = false;
    const eventSource = new EventSource(
      `/api/contests/stream?roomId=${roomId}`,
    );

    eventSource.onopen = () => {
      if (!cancelled) setStatus("connected");
    };

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

    eventSource.onerror = () => {
      if (!cancelled) setStatus("reconnecting");
    };

    return () => {
      cancelled = true;
      eventSource.close();
    };
  }, [roomId]);

  return status;
}
