import mongoose from "mongoose";

import { getPulseSession, requireAdmin, requireHostOrAdmin, requirePulseHost } from "@/lib/api/pulse";
import { err, ok, parseJson, parseSearchParams, type AppResult } from "@/lib/api/result";
import { parseObjectId } from "@/lib/api/result.server";
import { normalizeEmail, providerForEmail } from "@/lib/authPolicy";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { recordAudit } from "@/lib/pulse/audit";
import type { PulseHostRole, PulseQuizStatus } from "@/lib/pulse/constants";
import { linkHostAssignmentsForUser } from "@/lib/pulse/hostAssignments";
import { RoomCodeExhaustedError, withUniqueRoomCode } from "@/lib/pulse/roomCode";
import { createPulseQuizSchema, pulseCoHostSchema, pulseQuizQuerySchema } from "@/lib/pulse/schemas";
import PulseQuiz, { type PulseQuizRecord } from "@/models/PulseQuiz";
import User from "@/models/User";

type Quiz = Pick<PulseQuizRecord, "title" | "status" | "roomCode" | "ownerId" | "createdAt"> & {
  _id: mongoose.Types.ObjectId;
  hostAssignments: ReadonlyArray<Pick<PulseQuizRecord["hostAssignments"][number], "email" | "role" | "userId" | "linkedAt">>;
};
type AccessRole = PulseHostRole | "admin";
export type PulseHostDto = { email: string | null; userId: string | null; linkedAt: string | null };
export type PulseQuizSummaryDto = {
  id: string; title: string; status: PulseQuizStatus; roomCode: string;
  ownerEmail: string | null; coHostCount: number; createdAt: string;
  role: PulseHostRole | null;
};
export type PulseQuizDetailDto = {
  id: string; title: string; status: PulseQuizStatus; roomCode: string;
  owner: PulseHostDto; coHosts: PulseHostDto[]; createdAt: string; accessRole: AccessRole;
};

function summaryDto(quiz: Quiz, userId?: string): PulseQuizSummaryDto {
  return {
    id: quiz._id.toString(), title: quiz.title, status: quiz.status, roomCode: quiz.roomCode,
    ownerEmail: quiz.hostAssignments.find((host) => host.role === "owner")?.email ?? null,
    coHostCount: quiz.hostAssignments.filter((host) => host.role === "cohost").length,
    createdAt: quiz.createdAt.toISOString(),
    role: userId ? (quiz.ownerId?.toString() === userId ? "owner" : "cohost") : null,
  };
}
function detailDto(quiz: Quiz, accessRole: AccessRole): PulseQuizDetailDto {
  const owner = quiz.hostAssignments.find((host) => host.role === "owner");
  return {
    id: quiz._id.toString(), title: quiz.title, status: quiz.status, roomCode: quiz.roomCode,
    owner: { email: owner?.email ?? null, userId: quiz.ownerId?.toString() ?? null, linkedAt: owner?.linkedAt?.toISOString() ?? null },
    coHosts: quiz.hostAssignments.filter((host) => host.role === "cohost").map((host) => ({
      email: host.email, userId: host.userId?.toString() ?? null, linkedAt: host.linkedAt?.toISOString() ?? null,
    })),
    createdAt: quiz.createdAt.toISOString(), accessRole,
  };
}

export async function createQuiz(request: Request): Promise<AppResult<PulseQuizDetailDto>> {
  const authorization = await requireAdmin(request);
  if (!authorization.ok) return authorization;
  const parsed = await parseJson(request, createPulseQuizSchema);
  if (!parsed.ok) return parsed;
  const actor = { userId: authorization.data.user.id, role: "admin" as const };
  try {
    return await withUniqueRoomCode(async (roomCode) => {
      let created!: PulseQuizDetailDto;
      await mongoose.connection.transaction(async (session) => {
        const [quiz] = await PulseQuiz.create([{
          title: parsed.data.title, roomCode,
          hostAssignments: [{ email: parsed.data.ownerEmail, role: "owner", assignedBy: actor.userId }],
        }], { session });
        await recordAudit({ quizId: quiz._id, type: "quiz.created", actor }, { session });
        await recordAudit({ quizId: quiz._id, type: "host.assigned", actor,
          target: { type: "host", id: parsed.data.ownerEmail }, metadata: { role: "owner" },
        }, { session });
        created = detailDto(quiz.toObject(), "admin");
      });
      return ok(created);
    });
  } catch (error) {
    if (error instanceof RoomCodeExhaustedError)
      return err("SERVICE_UNAVAILABLE", "Could not allocate a room code. Try again.");
    throw error;
  }
}

async function listQuizzes(request: Request, userId?: string) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = parseSearchParams(searchParams, pulseQuizQuerySchema);
  if (!parsed.ok) return parsed;
  const { page, limit, skip } = parsePagination(searchParams);
  const filter = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(userId ? { $or: [{ ownerId: userId }, { coHostIds: userId }] } : {}),
  };
  const [quizzes, total] = await Promise.all([
    PulseQuiz.find(filter).select("title status roomCode ownerId hostAssignments createdAt")
      .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PulseQuiz.countDocuments(filter),
  ]);
  return ok(paginatedResponse(quizzes.map((quiz) => summaryDto(quiz, userId)), total, page, limit));
}
export async function listAdminQuizzes(request: Request) {
  const authorization = await requireAdmin(request);
  return authorization.ok ? listQuizzes(request) : authorization;
}
export async function listHostQuizzes(request: Request) {
  const session = await getPulseSession(request);
  if (!session.ok) return session;
  const { user } = session.data;
  if (session.data.session.authProvider !== "microsoft" || providerForEmail(user.email) !== "microsoft")
    return err("PULSE_NOT_HOST", "Use your Microsoft IITG sign-in to access host quizzes.");
  await linkHostAssignmentsForUser({ userId: user.id, email: user.email, authProvider: session.data.session.authProvider });
  return listQuizzes(request, user.id);
}
export async function getAdminQuiz(request: Request, quizId: string) {
  const authorization = await requireAdmin(request);
  if (!authorization.ok) return authorization;
  const parsed = parseObjectId(quizId, "quizId");
  if (!parsed.ok) return parsed;
  const quiz = await PulseQuiz.findById(quizId).lean();
  return quiz ? ok(detailDto(quiz, "admin")) : err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found.");
}
export async function getHostQuiz(request: Request, quizId: string) {
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  return ok(detailDto(authorization.data.quiz, authorization.data.role));
}

export async function changeCoHost(request: Request, quizId: string, operation: "add" | "remove", adminOnly = false): Promise<AppResult<PulseQuizDetailDto>> {
  if (adminOnly) {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin;
  }
  const authorization = await requireHostOrAdmin(request, quizId);
  if (!authorization.ok) return authorization;
  const parsed = await parseJson(request, pulseCoHostSchema);
  if (!parsed.ok) return parsed;
  const { email } = parsed.data;
  const { userId } = authorization.data;
  let result!: AppResult<PulseQuizDetailDto>;
  await mongoose.connection.transaction(async (session) => {
    const quiz = await PulseQuiz.findById(quizId).session(session);
    if (!quiz) { result = err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found."); return; }
    const role = authorization.data.role === "admin" ? "admin"
      : quiz.ownerId?.toString() === userId ? "owner"
        : quiz.coHostIds.some((id) => id.toString() === userId) ? "cohost" : null;
    if (!role) { result = err("PULSE_NOT_HOST", "No host assignment for this quiz."); return; }
    if (operation === "remove" && role === "cohost") { result = err("PULSE_NOT_AUTHORIZED", "Only the owner or an administrator can remove co-hosts."); return; }
    const assignment = quiz.hostAssignments.find((host) => host.email === email);
    const legacyOwner = !quiz.hostAssignments.some((host) => host.role === "owner") && quiz.ownerId
      ? await User.findById(quiz.ownerId).select("email").session(session).lean() : null;
    if (assignment?.role === "owner" || (legacyOwner?.email && normalizeEmail(legacyOwner.email) === email)) {
      result = err("CONFLICT", "The owner is permanent and cannot be changed."); return;
    }
    if (operation === "add") {
      if (assignment) { result = err("CONFLICT", "This email is already assigned to the quiz."); return; }
      const knownUser = await User.findOne({ email }).select("_id").session(session).lean();
      if (knownUser && (quiz.ownerId?.equals(knownUser._id) || quiz.hostAssignments.some((host) => host.userId?.equals(knownUser._id)))) {
        result = err("CONFLICT", "This user is already assigned to the quiz."); return;
      }
      quiz.hostAssignments.push({ email, role: "cohost", assignedBy: new mongoose.Types.ObjectId(userId), assignedAt: new Date() });
    } else {
      if (!assignment) { result = err("NOT_FOUND", "Co-host assignment not found."); return; }
      if (assignment.userId) quiz.coHostIds = quiz.coHostIds.filter((id) => id.toString() !== assignment.userId!.toString());
      quiz.hostAssignments.splice(quiz.hostAssignments.indexOf(assignment), 1);
    }
    await quiz.save({ session });
    await recordAudit({ quizId: quiz._id, type: operation === "add" ? "host.assigned" : "host.removed",
      actor: { userId, role }, target: { type: "host", id: email }, metadata: { role: "cohost" },
    }, { session });
    result = ok(detailDto(quiz.toObject(), role));
  });
  return result;
}
