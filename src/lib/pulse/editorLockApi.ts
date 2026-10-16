import { requirePulseHost } from "@/lib/api/pulse";
import { err, ok, parseJson, type AppResult } from "@/lib/api/result";
import { isPulseQuizEditable } from "@/lib/pulse/constants";
import {
  acquireEditorLock,
  heartbeatEditorLock,
  releaseEditorLock,
  type EditorLockHolder,
} from "@/lib/pulse/editorLock";
import { pulseLockTokenSchema } from "@/lib/pulse/schemas";

// A token is returned only to the host who just acquired the lock; other hosts see
// the holder's display name only.
export type EditorLockDto =
  | { acquired: true; lockToken: string }
  | { acquired: false; holder: EditorLockHolder | null };

const notEditable = () => err("CONFLICT", "The lobby has opened; this quiz can no longer be edited.");

async function hostForEdit(request: Request, quizId: string) {
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  const { role, userId, quiz } = authorization.data;
  if (role === "admin") return err("PULSE_NOT_HOST", "No host assignment for this quiz.");
  return ok({ userId, editable: isPulseQuizEditable(quiz.status) });
}

export async function acquireLock(request: Request, quizId: string): Promise<AppResult<EditorLockDto>> {
  const host = await hostForEdit(request, quizId);
  if (!host.ok) return host;
  if (!host.data.editable) return notEditable();
  return ok(await acquireEditorLock(quizId, { userId: host.data.userId }));
}

export async function heartbeatLock(request: Request, quizId: string): Promise<AppResult<Record<string, never>>> {
  const host = await hostForEdit(request, quizId);
  if (!host.ok) return host;
  const body = await parseJson(request, pulseLockTokenSchema);
  if (!body.ok) return body;
  if (!host.data.editable) return notEditable();
  const held = await heartbeatEditorLock(quizId, host.data.userId, body.data.lockToken);
  return held ? ok({}) : err("PULSE_EDITOR_LOCKED", "You no longer hold the editor lock.");
}

export async function releaseLock(request: Request, quizId: string): Promise<AppResult<{ released: boolean }>> {
  const host = await hostForEdit(request, quizId);
  if (!host.ok) return host;
  const body = await parseJson(request, pulseLockTokenSchema);
  if (!body.ok) return body;
  return ok(await releaseEditorLock(quizId, host.data.userId, body.data.lockToken));
}
