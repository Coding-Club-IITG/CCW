import mongoose, { type ClientSession } from "mongoose";
import type { AuditEventInput } from "@/lib/audit/types";
import { AppResultError } from "@/lib/api/result";
import { auditActor, auditedTransaction, insertAuditEvent } from "@/lib/audit";
import { normalizeEmail, providerForEmail } from "@/lib/authPolicy";
import {
  authCollections,
  authUserId,
  removeAuthRecords,
} from "@/lib/authStore";
import {
  LOGIN_SWITCH_RECENT_MS,
  LOGIN_SWITCH_VALID_MS,
  type LoginSwitchStatus,
} from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { enqueuePushNotifications, notify, notifyMany } from "@/lib/notify";
import LoginSwitchRequest, {
  type LoginSwitchRecord,
} from "@/models/LoginSwitchRequest";
import User from "@/models/User";

export interface SwitchActor {
  id: string;
  name?: string | null;
  access?: string | null;
}
export interface SwitchSession {
  id: string;
  userId: string;
  createdAt: Date | string;
  authProvider?: unknown;
}
export interface LoginSwitchDto {
  id: string;
  userId: string;
  googleEmail: string;
  sourceEmail: string;
  status: LoginSwitchStatus;
  expiresAt: string;
  submittedAt: string | null;
  reason: string;
}
export interface LoginRequestDto extends LoginSwitchDto {
  name: string;
  pizza_count: number;
}

export function switchDto(
  request: LoginSwitchRecord & { _id: unknown },
): LoginSwitchDto {
  return {
    id: String(request._id),
    userId: String(request.userId),
    googleEmail: request.googleEmail,
    sourceEmail: request.sourceEmail,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    submittedAt: request.submittedAt?.toISOString() ?? null,
    reason: request.reason ?? "",
  };
}

function conflict(message: string): never {
  throw new AppResultError({ code: "CONFLICT", message });
}

export function recentInstituteSession(session: SwitchSession): boolean {
  const age = Date.now() - new Date(session.createdAt).getTime();
  return (
    (session.authProvider ?? "microsoft") === "microsoft" &&
    age >= 0 &&
    age <= LOGIN_SWITCH_RECENT_MS
  );
}

function switchAudit(
  actor: SwitchActor,
  id: string,
  before: LoginSwitchStatus | null,
  after: LoginSwitchStatus,
): AuditEventInput {
  return {
    actor: auditActor(actor),
    category: "users" as const,
    action: "status_change" as const,
    operation: `users.login_switch.${after}`,
    target: { type: "login-switch-request", id, label: "Sign-in method" },
    before: before ? { status: before } : {},
    after: { status: after },
  };
}

async function sourceIdentity(userId: string, transaction?: ClientSession) {
  const user = await User.findById(userId)
    .session(transaction ?? null)
    .lean();
  const { accounts } = await authCollections();
  const account = await accounts.findOne(
    { userId: authUserId(userId), providerId: "microsoft" },
    { session: transaction },
  );
  if (!user?.email || providerForEmail(user.email) !== "microsoft" || !account)
    conflict("Institute login is required to request a switch.");
  return { user, account };
}

async function destinationAvailable(
  email: string,
  accountId: string,
  transaction: ClientSession,
) {
  const { accounts } = await authCollections();
  if (
    (await User.exists({ email }).session(transaction)) ||
    (await accounts.findOne(
      { providerId: "google", accountId },
      { session: transaction },
    ))
  )
    conflict("This Google account is unavailable. Select a different account.");
}

export async function expireLoginSwitchRequests(
  actor: SwitchActor,
  ownOnly = true,
) {
  await dbConnect();
  const expired = await LoginSwitchRequest.find({
    active: true,
    expiresAt: { $lte: new Date() },
    ...(ownOnly ? { userId: actor.id } : {}),
  })
    .select("_id")
    .lean();
  for (const item of expired) {
    const session = await mongoose.startSession();
    let ids: string[] = [];
    try {
      ids =
        (await session.withTransaction(async () => {
          const request = await LoginSwitchRequest.findOne({
            _id: item._id,
            active: true,
            expiresAt: { $lte: new Date() },
          }).session(session);
          if (!request) return [];
          const transaction = session;
          const before = request.status;
          request.status = "expired";
          request.active = false;
          await request.save({ session: transaction });
          const notification =
            before === "pending"
              ? await notify(
                  {
                    userId: String(request.userId),
                    type: "announcement",
                    title: "Login request expired",
                    message:
                      "Your institute login is still active. You can submit a new request from your profile.",
                    link: "/internal/profile",
                  },
                  { session: transaction },
                )
              : null;
          await insertAuditEvent(
            switchAudit(actor, String(request._id), before, "expired"),
            transaction,
          );
          return notification ? [String(notification._id)] : [];
        })) ?? [];
    } finally {
      await session.endSession();
    }
    await enqueuePushNotifications(ids);
  }
}

export async function verifySwitchDraft(
  actor: SwitchActor,
  sourceSession: SwitchSession,
  google: { email: string; id: string; emailVerified: boolean },
) {
  if (
    sourceSession.userId !== actor.id ||
    !recentInstituteSession(sourceSession)
  )
    conflict("Sign in with your institute account again to continue.");
  const email = normalizeEmail(google.email);
  if (providerForEmail(email) !== "google" || !google.emailVerified)
    conflict("Select a verified @gmail.com account.");
  await expireLoginSwitchRequests(actor);
  const session = await mongoose.startSession();
  try {
    return await auditedTransaction(session, async (transaction) => {
      const { user, account } = await sourceIdentity(actor.id, transaction);
      const { sessions } = await authCollections();
      if (
        !(await sessions.findOne(
          {
            _id: authUserId(sourceSession.id),
            userId: user._id,
            expiresAt: { $gt: new Date() },
          },
          { session: transaction },
        ))
      )
        conflict("Sign in with your institute account again to continue.");
      await destinationAvailable(email, google.id, transaction);
      if (
        await LoginSwitchRequest.exists({
          userId: actor.id,
          active: true,
        }).session(transaction)
      )
        conflict(
          "Cancel your existing request before selecting another account.",
        );
      const [draft] = await LoginSwitchRequest.create(
        [
          {
            userId: actor.id,
            sourceEmail: user.email!,
            sourceAccountId: account.accountId,
            sourceSessionId: sourceSession.id,
            googleEmail: email,
            googleAccountId: google.id,
            verifiedAt: new Date(),
            expiresAt: new Date(Date.now() + LOGIN_SWITCH_RECENT_MS),
            status: "draft",
            active: true,
          },
        ],
        { session: transaction },
      );
      return {
        result: switchDto(draft),
        audit: switchAudit(actor, String(draft._id), null, "draft"),
      };
    });
  } finally {
    await session.endSession();
  }
}

export async function mutateLoginSwitch(
  actor: SwitchActor,
  id: string,
  action: "submit" | "cancel" | "approve" | "reject",
  reason = "",
  sessionId?: string,
) {
  await dbConnect();
  const session = await mongoose.startSession();
  let output;
  try {
    output = await auditedTransaction(session, async (transaction) => {
      const review = action === "approve" || action === "reject";
      if (review && actor.access !== "Head" && actor.access !== "Admin")
        throw new AppResultError({
          code: "FORBIDDEN",
          message: "You cannot review login requests.",
        });
      const request =
        await LoginSwitchRequest.findById(id).session(transaction);
      if (!request || (!review && String(request.userId) !== actor.id))
        throw new AppResultError({
          code: "NOT_FOUND",
          message: "Login request not found.",
        });
      if (review && String(request.userId) === actor.id)
        throw new AppResultError({
          code: "FORBIDDEN",
          message: "Another Head or Admin must review your request.",
        });
      if (!request.active || request.expiresAt <= new Date())
        conflict(
          "This request is no longer active. Refresh to see its status.",
        );
      const before = request.status;
      if (
        action === "submit" &&
        (before !== "draft" || request.sourceSessionId !== sessionId)
      )
        conflict(
          "Verify Google from this institute session before submitting.",
        );
      if (review && before !== "pending")
        conflict("Only submitted requests can be reviewed.");
      const { user, account } = await sourceIdentity(
        String(request.userId),
        transaction,
      );
      if (
        account.accountId !== request.sourceAccountId ||
        user.email !== request.sourceEmail
      )
        conflict("The member's sign-in method has changed.");
      const notificationIds: string[] = [];
      if (action === "submit" || action === "approve")
        await destinationAvailable(
          request.googleEmail,
          request.googleAccountId,
          transaction,
        );
      if (action === "submit") {
        request.status = "pending";
        request.submittedAt = new Date();
        request.expiresAt = new Date(Date.now() + LOGIN_SWITCH_VALID_MS);
        const reviewers = await User.find({
          access: { $in: ["Head", "Admin"] },
          _id: { $ne: user._id },
        })
          .select("_id")
          .session(transaction)
          .lean();
        const notifications = await notifyMany(
          reviewers.map((reviewer) => String(reviewer._id)),
          {
            type: "announcement",
            title: "Login request submitted",
            message:
              "A member has requested to replace institute login with Google.",
            link: "/admin/users?view=requests",
          },
          { session: transaction },
        );
        notificationIds.push(
          ...notifications.map((notification) => String(notification._id)),
        );
      } else {
        request.status =
          action === "approve"
            ? "approved"
            : action === "reject"
              ? "rejected"
              : "cancelled";
        request.active = false;
        if (review) {
          request.reviewedAt = new Date();
          request.reviewedBy = authUserId(actor.id);
          request.reason = reason;
        }
      }
      if (action === "approve") {
        const { accounts } = await authCollections();
        const replaced = await accounts.updateOne(
          {
            _id: account._id,
            providerId: "microsoft",
            accountId: request.sourceAccountId,
          },
          {
            $set: {
              providerId: "google",
              accountId: request.googleAccountId,
              updatedAt: new Date(),
            },
            $unset: {
              accessToken: "",
              refreshToken: "",
              idToken: "",
              accessTokenExpiresAt: "",
              refreshTokenExpiresAt: "",
              scope: "",
              password: "",
            },
          },
          { session: transaction },
        );
        if (replaced.modifiedCount !== 1)
          conflict("The member's sign-in method has changed.");
        await User.updateOne(
          { _id: user._id, email: request.sourceEmail },
          {
            $set: {
              email: request.googleEmail,
              instituteEmail: request.sourceEmail,
              emailVerified: true,
            },
          },
          { session: transaction },
        );
        await removeAuthRecords(String(user._id), transaction, false);
      }
      await request.save({ session: transaction });
      if (review) {
        const notification = await notify(
          {
            userId: String(user._id),
            type: "announcement",
            title:
              action === "approve"
                ? "Google login approved"
                : "Login request rejected",
            message:
              action === "approve"
                ? "Use your approved Google account to sign in. Your existing sessions have been signed out."
                : "Your institute login remains active. View your profile for the review outcome.",
            link: "/internal/profile",
          },
          { session: transaction },
        );
        notificationIds.push(String(notification._id));
      }
      return {
        result: { request: switchDto(request), notificationIds },
        audit: switchAudit(actor, id, before, request.status),
      };
    });
  } finally {
    await session.endSession();
  }
  await enqueuePushNotifications(output.notificationIds);
  return output.request;
}
