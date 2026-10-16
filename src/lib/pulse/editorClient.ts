import { err, readAppResult, type AppResult } from "@/lib/api/result";
import type { SaveBody } from "@/lib/pulse/deckEditorStore";
import type { PulseDeckDto } from "@/lib/pulse/deckService";
import type { EditorLockDto } from "@/lib/pulse/editorLockApi";

// Browser-side calls for the deck editor. A network failure becomes a normal AppResult
// error so callers never treat a thrown fetch as success.

const base = (quizId: string) => `/api/pulse/host/${encodeURIComponent(quizId)}`;

async function call<T>(url: string, init: RequestInit = {}): Promise<AppResult<T>> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });
    return await readAppResult<T>(response);
  } catch {
    return err("SERVICE_UNAVAILABLE", "Could not reach the server.");
  }
}

export const saveDeck = (quizId: string, body: SaveBody & { lockToken: string }) =>
  call<PulseDeckDto>(`${base(quizId)}/deck`, { method: "PUT", body: JSON.stringify(body) });

export const acquireLock = (quizId: string) => call<EditorLockDto>(`${base(quizId)}/lock`, { method: "POST" });

export const heartbeatLock = (quizId: string, lockToken: string) =>
  call<Record<string, never>>(`${base(quizId)}/lock`, { method: "PATCH", body: JSON.stringify({ lockToken }) });

export const releaseLock = (quizId: string, lockToken: string) =>
  call<{ released: boolean }>(`${base(quizId)}/lock`, { method: "DELETE", body: JSON.stringify({ lockToken }) });
