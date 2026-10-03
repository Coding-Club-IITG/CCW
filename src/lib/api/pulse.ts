import { isHead } from "@/lib/access/roles";
import { requireSession } from "@/lib/api/auth";
import { err, ok, type AppResult } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonResult,
  parseObjectId,
} from "@/lib/api/result.server";
import { linkHostAssignmentsForUser } from "@/lib/pulse/hostAssignments";
import { providerForEmail } from "@/lib/authPolicy";
import { webEnv } from "@/lib/env/web";
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
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (!origin || ![webEnv.BASE_URL, ...webEnv.TRUSTED_ORIGINS].some(
        (value) => new URL(value).origin === origin,
      )) return jsonResult(err("PULSE_NOT_AUTHORIZED", "Request origin is not allowed."), { headers });
    }
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
  return isHead(session.data.user.access)
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
  const instituteSession = session.data.session.authProvider === "microsoft"
    && providerForEmail(user.email) === "microsoft";
  // Link before reading so this request sees the newly assigned host IDs.
  await linkHostAssignmentsForUser({
    userId: user.id,
    email: user.email,
    authProvider: session.data.session.authProvider,
  });
  const quiz = await PulseQuiz.findById(quizId).lean();
  if (!quiz) return err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found.");
  if (allowAdmin && isHead(user.access))
    return ok({ quiz, role: "admin" as const, userId: user.id });
  if (instituteSession && quiz.ownerId?.toString() === user.id)
    return ok({ quiz, role: "owner" as const, userId: user.id });
  if (instituteSession && quiz.coHostIds.some((id) => id.toString() === user.id))
    return ok({ quiz, role: "cohost" as const, userId: user.id });
  return err("PULSE_NOT_HOST", "No host assignment for this quiz.");
}

export function requirePulseHost(request: Request, quizId: string) {
  return requireQuizAccess(request, quizId, false);
}

export function requireHostOrAdmin(request: Request, quizId: string) {
  return requireQuizAccess(request, quizId, true);
}
