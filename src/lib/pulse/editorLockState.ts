import type { EditorLockHolder } from "@/lib/pulse/editorLock";

// Client-side editor lock lifecycle as a pure reducer.

export type LockState =
  /** Nothing to acquire: the quiz can no longer be edited. */
  | { phase: "idle" }
  | { phase: "acquiring" }
  | { phase: "held"; token: string }
  /** Another host holds the lock. */
  | { phase: "blocked"; holder: EditorLockHolder | null }
  /** We held it, but a heartbeat or save found it gone (expired or taken over). */
  | { phase: "lost" }
  /** The lock service could not be reached. */
  | { phase: "unavailable"; message: string };

export type LockEvent =
  | { type: "acquire-started" }
  | { type: "acquired"; token: string }
  | { type: "blocked"; holder: EditorLockHolder | null }
  | { type: "lock-lost" }
  | { type: "service-error"; message: string }
  | { type: "released" };

export const initialLockState = (editable: boolean): LockState =>
  editable ? { phase: "acquiring" } : { phase: "idle" };

export function lockReducer(state: LockState, event: LockEvent): LockState {
  switch (event.type) {
    case "acquire-started":
      // A held lock is never replaced while it may still be valid.
      return state.phase === "held" ? state : { phase: "acquiring" };
    case "acquired":
      return { phase: "held", token: event.token };
    case "blocked":
      return { phase: "blocked", holder: event.holder };
    case "lock-lost":
      return state.phase === "held" || state.phase === "acquiring" ? { phase: "lost" } : state;
    case "service-error":
      return { phase: "unavailable", message: event.message };
    case "released":
      return { phase: "idle" };
  }
}

export const lockToken = (state: LockState) => (state.phase === "held" ? state.token : null);
/** Only a held lock allows edits. */
export const canEditWithLock = (state: LockState) => state.phase === "held";
