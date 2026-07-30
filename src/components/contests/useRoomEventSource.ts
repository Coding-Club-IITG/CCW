"use client";

import { useEffect, useRef } from "react";

interface RoomEventPayload {
  type: string;
  [key: string]: unknown;
}

export function useRoomEventSource(
  roomId: string,
  onEvent: (payload: RoomEventPayload) => void,
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
        const data = JSON.parse(event.data);
        if (data.payload) {
          onEventRef.current(data.payload);
        }
      } catch {
        // Ignore malformed events and keep the stream connected.
      }
    };

    return () => eventSource.close();
  }, [roomId]);
}
