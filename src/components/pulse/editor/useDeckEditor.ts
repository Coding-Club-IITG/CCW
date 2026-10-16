"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "zustand";

import { PULSE_EDITOR_LOCK_HEARTBEAT_MS, pulseErrorMessage } from "@/lib/pulse/constants";
import { createDeckEditorStore, isDirty, type DeckEditorStore } from "@/lib/pulse/deckEditorStore";
import type { PulseDeckDto } from "@/lib/pulse/deckService";
import { acquireLock, heartbeatLock, releaseLock, saveDeck } from "@/lib/pulse/editorClient";
import { canEditWithLock, initialLockState, lockReducer, lockToken } from "@/lib/pulse/editorLockState";

/** Wires the draft store, explicit save and the editor lock lifecycle together. */
export function useDeckEditor(quizId: string, initial: PulseDeckDto) {
  const [store] = useState<DeckEditorStore>(() => createDeckEditorStore(initial));
  const state = useStore(store, (s) => s);
  const [lock, dispatch] = useReducer(lockReducer, initial.editable, initialLockState);
  const tokenRef = useRef<string | null>(null);
  // Only the latest acquire attempt may update state, and nothing is kept after unmount.
  const acquireSeq = useRef(0);
  const mounted = useRef(false);

  // Only a held lock allows edits (also false when the quiz is no longer editable).
  useEffect(() => {
    tokenRef.current = lockToken(lock);
    store.actions.setCanEdit(canEditWithLock(lock));
  }, [lock, store]);

  const tryAcquire = useCallback(async () => {
    dispatch({ type: "acquire-started" });
    const seq = ++acquireSeq.current;
    const result = await acquireLock(quizId);
    if (result.ok && result.data.acquired && !mounted.current) {
      void releaseLock(quizId, result.data.lockToken);
      return;
    }
    if (seq !== acquireSeq.current || !mounted.current) return;
    if (!result.ok) dispatch({ type: "service-error", message: pulseErrorMessage(result.error) });
    else if (result.data.acquired) dispatch({ type: "acquired", token: result.data.lockToken });
    else dispatch({ type: "blocked", holder: result.data.holder });
  }, [quizId]);

  // Acquire on open; release on leave.
  useEffect(() => {
    mounted.current = true;
    if (!initial.editable) return;
    void tryAcquire();
    return () => {
      mounted.current = false;
      acquireSeq.current += 1;
      const token = tokenRef.current;
      if (token) void releaseLock(quizId, token);
    };
  }, [initial.editable, quizId, tryAcquire]);

  // Heartbeat while the lock is held.
  const held = lock.phase === "held";
  useEffect(() => {
    if (!held) return;
    const timer = window.setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const result = await heartbeatLock(quizId, token);
      if (!result.ok && result.error.code === "PULSE_EDITOR_LOCKED") dispatch({ type: "lock-lost" });
    }, PULSE_EDITOR_LOCK_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [held, quizId]);

  const save = useCallback(async () => {
    const body = store.actions.beginSave();
    if (!body) return;
    const token = tokenRef.current;
    if (!token) {
      store.actions.saveFailed({ code: "PULSE_EDITOR_LOCKED", message: "You no longer hold the editor lock." });
      return;
    }
    const result = await saveDeck(quizId, { ...body, lockToken: token });
    if (result.ok) {
      store.actions.saveSucceeded(result.data);
      return;
    }
    store.actions.saveFailed(result.error);
    if (result.error.code === "PULSE_EDITOR_LOCKED") dispatch({ type: "lock-lost" });
  }, [quizId, store]);

  return { store, state, lock, save, tryAcquire, dirty: isDirty(state) };
}
