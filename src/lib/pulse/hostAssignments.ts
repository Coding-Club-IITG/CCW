import mongoose from "mongoose";

import { normalizeEmail, providerForEmail } from "@/lib/authPolicy";
import { recordAudit } from "@/lib/pulse/audit";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

/** Call only with identity data from a validated server-side session. */
export async function linkHostAssignmentsForUser(params: {
  userId: string;
  email: string;
  authProvider: unknown;
}): Promise<{ linkedCount: number }> {
  if (params.authProvider !== "microsoft") return { linkedCount: 0 };
  if (!/^[a-f\d]{24}$/i.test(params.userId)) throw new Error("Invalid user ID.");
  const email = normalizeEmail(params.email);
  if (providerForEmail(email) !== "microsoft") return { linkedCount: 0 };
  const user = await User.findById(params.userId).select("_id email").lean();
  if (!user?.email || normalizeEmail(user.email) !== email)
    return { linkedCount: 0 };

  const pending = { email, userId: null };
  const quizzes = await PulseQuiz.find({
    hostAssignments: { $elemMatch: pending },
  }).lean();
  let linkedCount = 0;
  for (const quiz of quizzes) {
    for (const assignment of quiz.hostAssignments) {
      if (assignment.email !== email || assignment.userId) continue;
      // The conditional write and audit commit together. Concurrent calls retry
      // the transaction and see the assignment already linked.
      let linked = false;
      await mongoose.connection.transaction(async (session) => {
        linked = false;
        const { role } = assignment;
        const result = await PulseQuiz.updateOne(
          {
            _id: quiz._id,
            hostAssignments: { $elemMatch: { ...pending, role } },
            ...(role === "owner" ? { ownerId: { $in: [null, user._id] } } : {}),
          },
          {
            $set: {
              "hostAssignments.$.userId": user._id,
              "hostAssignments.$.linkedAt": new Date(),
              ...(role === "owner" ? { ownerId: user._id } : {}),
            },
            ...(role === "cohost" ? { $addToSet: { coHostIds: user._id } } : {}),
          },
          { session, runValidators: true },
        );
        if (!result.modifiedCount) return;
        await recordAudit(
          {
            quizId: quiz._id,
            type: "host.linked",
            actor: { userId: user._id, role },
            target: { type: "host", id: user._id.toString() },
            metadata: { role },
          },
          { session },
        );
        linked = true;
      });
      if (linked) linkedCount++;
    }
  }
  return { linkedCount };
}
