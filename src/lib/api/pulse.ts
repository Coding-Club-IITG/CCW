import { err, ok } from "@/lib/api/result";
import { auth } from "@/lib/auth/server";
import { isAdmin } from "@/lib/access/roles";
import { normalizeEmail } from "@/lib/auth/policy";
import { NextRequest } from "next/server";

import PulseQuiz from "@/models/PulseQuiz";
import PulseHostAssignment from "@/models/PulseHostAssignment";
import User from "@/models/User";

/**
 * Normalize email by trimming whitespace and converting to lowercase
 * Reuses the existing normalizeEmail from auth/policy
 */
export const pulseNormalizeEmail = normalizeEmail;

/**
 * Require a valid session for Pulse operations
 * Returns the session user if authenticated, throws UNAUTHENTICATED otherwise
 */
export async function requirePulseSession(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return err("UNAUTHENTICATED", "Unauthorized");
  }
  return ok(session.user);
}

/**
 * Require the user to be a host (owner or co-host) of the specified quiz
 * Returns { quiz, role } where role is "owner" or "co-host"
 * Throws UNAUTHENTICATED if no session
 * Throws FORBIDDEN if session exists but user is not assigned as host
 */
export async function requirePulseHost(request: NextRequest, quizId: string) {
  // First, require a valid session
  const sessionResult = await requirePulseSession(request);
  if (!sessionResult.ok) {
    return sessionResult; // Propagate the UNAUTHENTICATED error
  }
  const user = sessionResult.data;

  // Validate quizId format
  if (!/^[a-f\d]{24}$/i.test(quizId)) {
    return err("VALIDATION_ERROR", "Invalid quiz ID", {
      fields: { quizId: ["Quiz ID must be a 24-character hexadecimal ObjectId"] },
    });
  }

  // Find the quiz by ID
  const quiz = await PulseQuiz.findById(quizId).lean();
  if (!quiz) {
    return err("NOT_FOUND", "Quiz not found");
  }

  // Normalize the email from the session's associated User record
  // We get the email from the authenticated user, not from client input
  const userEmail = user.email;
  if (!userEmail) {
    return err("UNAUTHENTICATED", "User email not found");
  }
  const normalizedEmail = pulseNormalizeEmail(userEmail);

  // FALLBACK: Link host assignments if not already linked via auth hooks
  // This ensures that if the auth hook didn't run for some reason, we still link
  try {
    await linkHostAssignmentsForUser({ userId: user._id.toString(), email: normalizedEmail });
  } catch (error) {
    // Log but don't fail - linking is best-effort
    // eslint-disable-next-line no-console
    console.warn("Failed to link host assignments in requirePulseHost:", error);
  }

  // Check if the user is an owner or co-host of the quiz
  const isOwner = quiz.ownerId?.toString() === user._id.toString();
  const isCoHost = quiz.coHostIds?.some(
    (id) => id.toString() === user._id.toString()
  ) ?? false;

  if (isOwner) {
    return ok({ quiz, role: "owner" });
  }

  if (isCoHost) {
    return ok({ quiz, role: "co-host" });
  }

  // User is authenticated but not assigned as host
  return err("FORBIDDEN", "You don't have permission to manage this quiz");
}

/**
 * Require the user to be either a host (owner/co-host) or an admin of the specified quiz
 * Returns { quiz, role } where role is "owner", "co-host", or "admin"
 * Throws UNAUTHENTICATED if no session
 * Throws FORBIDDEN if session exists but user is neither host nor admin
 */
export async function requireHostOrAdmin(request: NextRequest, quizId: string) {
  // First, try to require pulse host (owner/co-host)
  const hostResult = await requirePulseHost(request, quizId);
  if (hostResult.ok) {
    // User is host, return with host role
    return hostResult;
  }

  // If not host, check if user is admin
  const sessionResult = await requirePulseSession(request);
  if (!sessionResult.ok) {
    return sessionResult; // Propagate the UNAUTHENTICATED error
  }
  const user = sessionResult.data;

  // Validate quizId format (reuse validation from requirePulseHost)
  if (!/^[a-f\d]{24}$/i.test(quizId)) {
    return err("VALIDATION_ERROR", "Invalid quiz ID", {
      fields: { quizId: ["Quiz ID must be a 24-character hexadecimal ObjectId"] },
    });
  }

  // Find the quiz by ID
  const quiz = await PulseQuiz.findById(quizId).lean();
  if (!quiz) {
    return err("NOT_FOUND", "Quiz not found");
  }

  // Check if user is admin
  if (isAdmin(user.access)) {
    return ok({ quiz, role: "admin" });
  }

  // User is authenticated but neither host nor admin
  return err("FORBIDDEN", "You don't have permission to manage this quiz");
}

/**
 * Link host assignments for a user based on their email
 * For matching unlinked assignments (where userId is null), set:
 *   - userId to the provided userId
 *   - linkedAt to current timestamp
 *   - Ensure ownerId/coHostIds are properly set in the quiz (based on assignment type)
 *   - Write host.linked audit entry (idempotent - safe if duplicates exist)
 * @param params - Object containing userId and email
 * @returns Object with count of assignments linked
 */
export async function linkHostAssignmentsForUser(params: {
  userId: string;
  email: string;
}): Promise<{ linkedCount: number }> {
  // Validate inputs
  if (!params.userId || !/^[a-f\d]{24}$/i.test(params.userId)) {
    throw new Error("Invalid userId");
  }

  if (!params.email) {
    throw new Error("Email is required");
  }

  // Normalize the email (trim + lowercase)
  const normalizedEmail = pulseNormalizeEmail(params.email);

  // Verify the user exists
  const user = await User.findById(params.userId).select("_id email").lean();
  if (!user) {
    throw new Error("User not found");
  }

  // Find all unlinked host assignments matching the normalized email
  // Unlinked means userId is null
  const unlinkedAssignments = await PulseHostAssignment.find({
    email: normalizedEmail,
    userId: null,
  }).lean();

  if (unlinkedAssignments.length === 0) {
    return { linkedCount: 0 };
  }

  // Track which quizzes we need to update to avoid duplicate updates
  const quizUpdates: Map<string, { ownerId: string | null; coHostIds: string[] }> = new Map();

  // Process each assignment
  const linkedAssignments = await Promise.all(
    unlinkedAssignments.map(async (assignment) => {
      // Set userId and linkedAt
      assignment.userId = params.userId;
      assignment.linkedAt = new Date();

      // Save the assignment
      await assignment.save();

      // Prepare quiz update
      const quizId = assignment.quizId.toString();
      if (!quizUpdates.has(quizId)) {
        quizUpdates.set(quizId, { ownerId: null, coHostIds: [] });
      }

      const quizUpdate = quizUpdates.get(quizId)!;
      if (assignment.assignmentType === "owner") {
        quizUpdate.ownerId = params.userId;
      } else if (assignment.assignmentType === "co-host") {
        quizUpdate.coHostIds.push(params.userId);
      }

      return assignment;
    })
  );

  // Update quizzes with the new host assignments
  for (const [quizId, update] of quizUpdates.entries()) {
    const quizUpdateObj: any = {};
    if (update.ownerId !== null) {
      quizUpdateObj.ownerId = update.ownerId;
    }
    if (update.coHostIds.length > 0) {
      quizUpdateObj.coHostIds = update.coHostIds;
    }

    await PulseQuiz.findByIdAndUpdate(quizId, quizUpdateObj, { new: true });
  }

  // TODO: Write host.linked audit entries
  // This would involve creating PulseAuditEvent records for each linked assignment
  // For now, we'll skip this as the audit system might need to be extended

  return { linkedCount: linkedAssignments.length };
}