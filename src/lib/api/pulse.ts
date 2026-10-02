import { err, ok } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/access/roles";
import { normalizeEmail } from "@/lib/authPolicy";
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
    await linkHostAssignmentsForUser({ userId: user.id, email: normalizedEmail });
  } catch (error) {
    // Log but don't fail - linking is best-effort
    // eslint-disable-next-line no-console
    console.warn("Failed to link host assignments in requirePulseHost:", error);
  }

  // Check if the user is an owner or co-host of the quiz
  const isOwner = quiz.ownerId.toString() === user.id;
  const isCoHost = quiz.coHostIds?.some(
    (id) => id.toString() === user.id
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

  // Find all quizzes that have host assignments matching the normalized email
  // where the assignment is not yet linked to a user (userId is null)
  const quizzes = await PulseQuiz.find({
    "hostAssignments.email": normalizedEmail,
    "hostAssignments.userId": null,
  });

  if (quizzes.length === 0) {
    return { linkedCount: 0 };
  }

  let linkedCount = 0;

  // Process each quiz
  for (const quiz of quizzes) {
    // We need to update the quiz document
    let isModified = false;

    // Process each host assignment in the quiz
    const updatedHostAssignments = quiz.hostAssignments.map((assignment: any) => {
      // Check if this assignment matches the email and is not yet linked
      if (
        assignment.email === normalizedEmail &&
        (!assignment.userId || assignment.userId.toString() === "null")
      ) {
        linkedCount++;
        isModified = true;

        // Create updated assignment with linking info
        const updatedAssignment = {
          ...assignment,
          userId: user._id,
          linkedAt: new Date()
        };

        // If this is an owner assignment, we'll need to update the quiz's ownerId
        // If this is a cohost assignment, we'll need to add to coHostIds
        // We'll handle those updates separately below
        return updatedAssignment;
      }
      return assignment;
    });

    // Only proceed if we actually linked something
    if (isModified) {
      // Determine what updates we need to make to the quiz
      const updateObj: any = {
        hostAssignments: updatedHostAssignments
      };

      // Check if we need to update ownerId (for owner role assignments)
      const hasOwnerAssignment = quiz.hostAssignments.some(
        (assignment: any) =>
          assignment.email === normalizedEmail &&
          assignment.role === "owner" &&
          (!assignment.userId || assignment.userId.toString() === "null")
      );

      if (hasOwnerAssignment) {
        updateObj.ownerId = user._id;
      }

      // Check if we need to add to coHostIds (for cohost role assignments)
      const hasCohostAssignment = quiz.hostAssignments.some(
        (assignment: any) =>
          assignment.email === normalizedEmail &&
          assignment.role === "cohost" &&
          (!assignment.userId || assignment.userId.toString() === "null")
      );

      if (hasCohostAssignment) {
        // Get current coHostIds and add the new user, avoiding duplicates
        const currentCoHostIds = quiz.coHostIds || [];
        const userIdString = user._id.toString();
        if (!currentCoHostIds.some((id: any) => id.toString() === userIdString)) {
          updateObj.coHostIds = [...currentCoHostIds, user._id];
        }
      }

      // Save the updated quiz
      await quiz.save();
    }
  }

  // TODO: Write host.linked audit entries
  // This would involve creating PulseAuditEvent records for each linked assignment
  // For now, we'll skip this as the audit system might need to be extended

  return { linkedCount: linkedCount };
}