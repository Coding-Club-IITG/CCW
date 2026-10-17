"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "zustand";

import { pulseErrorMessage } from "@/lib/pulse/constants";
import { createDeckEditorStore, isDirty, type DeckEditorStore } from "@/lib/pulse/deckEditorStore";
import type { PulseDeckDto } from "@/lib/pulse/deckService";
import { acquireLock, loadDeck, releaseLock, saveDeck } from "@/lib/pulse/editorClient";
import { canEditWithLock, initialLockState, lockReducer, lockToken } from "@/lib/pulse/editorLockState";

// setTimeout can't take delays above a signed 32-bit integer.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** Wires the draft store, explicit save and the editor lock lifecycle together. */
export function useDeckEditor(quizId: string, initial: PulseDeckDto) {
  const [store] = useState<DeckEditorStore>(() => createDeckEditorStore(initial));
  const state = useStore(store, (s) => s);
  const [lock, dispatch] = useReducer(lockReducer, initial.editable, initialLockState);
  const [reloading, setReloading] = useState(false);
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
    else if (result.data.acquired) {
      dispatch({ type: "acquired", token: result.data.lockToken, expiresAt: Date.parse(result.data.expiresAt) });
    } else dispatch({ type: "blocked", holder: result.data.holder });
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

  // The lock isn't extended, so it expires at a known time; the draft is kept meanwhile.
  const expiresAt = lock.phase === "held" ? lock.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => dispatch({ type: "lock-lost" }), Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT_MS));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  const save = useCallback(async () => {
    const body = store.actions.beginSave();
    if (!body) return;
    const token = tokenRef.current;
    if (!token) {
      store.actions.saveFailed({ code: "CONFLICT", message: "You no longer hold the editor lock." });
      return;
    }
    const result = await saveDeck(quizId, { ...body, lockToken: token });
    if (result.ok) {
      store.actions.saveSucceeded(result.data);
      return;
    }
    // A failed save keeps the draft and is never shown as saved.
    store.actions.saveFailed(result.error);
    if (result.error.code === "CONFLICT" && result.error.fields?.editorLock) dispatch({ type: "lock-lost" });
  }, [quizId, store]);

  /** Discards the draft for the server's latest deck, then takes the lock again if needed. */
  const reloadLatest = useCallback(async () => {
    setReloading(true);
    const result = await loadDeck(quizId);
    setReloading(false);
    if (!result.ok) {
      store.actions.saveFailed(result.error);
      return;
    }
    store.actions.loadLatest(result.data);
    if (lockToken(lock) === null) await tryAcquire();
  }, [quizId, store, lock, tryAcquire]);

  return { store, state, lock, save, tryAcquire, reloadLatest, reloading, dirty: isDirty(state) };
}
