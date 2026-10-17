import { requirePulseHost } from "@/lib/api/pulse";
import { err, ok, parseJson, type AppResult } from "@/lib/api/result";
import { dbConnect } from "@/lib/mongodb";
import { isPulseQuizEditable } from "@/lib/pulse/constants";
import {
  acquireEditorLock,
  releaseEditorLock,
  type EditorLockHolder,
} from "@/lib/pulse/editorLock";
import { pulseLockTokenSchema } from "@/lib/pulse/schemas";

// A token is returned only to the host who just acquired the lock; other hosts see
// the holder's display name only.
export type EditorLockDto =
  | { acquired: true; lockToken: string; expiresAt: string }
  | { acquired: false; holder: EditorLockHolder | null };

const notEditable = () => err("CONFLICT", "The lobby has opened; this quiz can no longer be edited.");

async function hostForEdit(request: Request, quizId: string) {
  await dbConnect();
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
  const result = await acquireEditorLock(quizId, { userId: host.data.userId });
  return ok(result.acquired
    ? { acquired: true, lockToken: result.lockToken, expiresAt: result.expiresAt.toISOString() }
    : result);
}

export async function releaseLock(request: Request, quizId: string): Promise<AppResult<{ released: boolean }>> {
  const host = await hostForEdit(request, quizId);
  if (!host.ok) return host;
  const body = await parseJson(request, pulseLockTokenSchema);
  if (!body.ok) return body;
  return ok(await releaseEditorLock(quizId, host.data.userId, body.data.lockToken));
}
