import { isAdmin } from "@/lib/access/roles";
import { requireSession } from "@/lib/api/auth";
import { err, ok, type AppResult } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonResult,
  parseObjectId,
} from "@/lib/api/result.server";
import { linkHostAssignmentsForUser } from "@/lib/pulse/hostAssignments";
import PulseQuiz from "@/models/PulseQuiz";

export type PulseErrorCode =
  | "PULSE_QUIZ_NOT_FOUND"
  | "PULSE_NOT_HOST"
  | "PULSE_NOT_AUTHORIZED";

export class PulseError extends Error {
  constructor(public readonly code: PulseErrorCode, message: string) {
    super(message);
    this.name = "PulseError";
  }
}

export async function pulseRoute<T>(
  request: Request,
  operation: () => Promise<AppResult<T>>,
) {
  const headers = { "Cache-Control": "no-store" };
  try {
    return jsonResult(await operation(), { headers });
  } catch (error) {
    if (error instanceof PulseError)
      return jsonResult(err(error.code, error.message), { headers });
    const response = boundaryErrorResponse("pulse_route", error, request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

export async function getPulseSession(request: Request) {
  const result = await requireSession(request);
  return result.ok
    ? result
    : err("PULSE_NOT_AUTHORIZED", "Sign in to use Pulse.");
}

export async function requireAdmin(request: Request) {
  const session = await getPulseSession(request);
  if (!session.ok) return session;
  return isAdmin(session.data.user.access)
    ? session
    : err("PULSE_NOT_AUTHORIZED", "Administrator access required.");
}

async function requireQuizAccess(
  request: Request,
  quizId: string,
  allowAdmin: boolean,
) {
  const session = await getPulseSession(request);
  if (!session.ok) return session;
  const parsedId = parseObjectId(quizId, "quizId");
  if (!parsedId.ok) return parsedId;

  const { user } = session.data;
  // Link before reading so this request sees the newly assigned host IDs.
  await linkHostAssignmentsForUser({
    userId: user.id,
    email: user.email,
    authProvider: session.data.session.authProvider,
  });
  const quiz = await PulseQuiz.findById(quizId).lean();
  if (!quiz) return err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found.");
  if (quiz.ownerId?.toString() === user.id)
    return ok({ quiz, role: "owner" as const });
  if (quiz.coHostIds.some((id) => id.toString() === user.id))
    return ok({ quiz, role: "cohost" as const });
  if (allowAdmin && isAdmin(user.access))
    return ok({ quiz, role: "admin" as const });
  return err("PULSE_NOT_HOST", "No host assignment for this quiz.");
}

export function requirePulseHost(request: Request, quizId: string) {
  return requireQuizAccess(request, quizId, false);
}

export function requireHostOrAdmin(request: Request, quizId: string) {
  return requireQuizAccess(request, quizId, true);
}
