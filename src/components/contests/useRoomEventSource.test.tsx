import { act, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRoomEventSource } from "./useRoomEventSource";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({ roomId, label }: { roomId: string; label: string }) {
  const [events, setEvents] = useState<string[]>([]);

  useRoomEventSource(roomId, (payload) => {
    setEvents((current) => [...current, `${label}:${payload.type}`]);
  });

  return <output>{events.join(",")}</output>;
}

describe("useRoomEventSource", () => {
  it("keeps one connection while delivering events to the latest callback", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    FakeEventSource.instances = [];

    const view = render(<Harness roomId="room-1" label="first" />);
    const source = FakeEventSource.instances[0];

    view.rerender(<Harness roomId="room-1" label="latest" />);
    act(() => {
      source.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ payload: { type: "room.score" } }),
        }),
      );
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(view.getByText("latest:room.score")).toBeInTheDocument();

    view.unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("reconnects and closes the previous stream when the room changes", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    FakeEventSource.instances = [];

    const view = render(<Harness roomId="room-1" label="event" />);
    const firstSource = FakeEventSource.instances[0];

    view.rerender(<Harness roomId="room-2" label="event" />);

    expect(firstSource.close).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toBe(
      "/api/contests/stream?roomId=room-2",
    );
  });
});
