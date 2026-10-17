import type { EditorLockHolder } from "@/lib/pulse/editorLock";

// Client-side editor lock lifecycle as a pure reducer.

export type LockState =
  /** Nothing to acquire: the quiz can no longer be edited. */
  | { phase: "idle" }
  | { phase: "acquiring" }
  /** `expiresAt` is epoch ms; the lock is not extended, so the editor releases at that time. */
  | { phase: "held"; token: string; expiresAt: number }
  /** Another host holds the lock. */
  | { phase: "blocked"; holder: EditorLockHolder | null }
  /** We held it, but it expired or a save found it taken over. */
  | { phase: "lost" }
  /** The lock service could not be reached. */
  | { phase: "unavailable"; message: string };

export type LockEvent =
  | { type: "acquire-started" }
  | { type: "acquired"; token: string; expiresAt: number }
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
      return { phase: "held", token: event.token, expiresAt: event.expiresAt };
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
