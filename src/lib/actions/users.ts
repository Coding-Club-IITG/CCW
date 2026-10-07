"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit/index";
import { summarizeUser } from "@/lib/audit/summary";
import {
  err as appError,
  ok,
  toBsonSafe,
  AppResultError,
} from "@/lib/api/result";
import { auth } from "@/lib/auth/server";
import { approvedEmailSchema } from "@/lib/auth/policy";
import { removeAuthRecords } from "@/lib/auth/identityStore";
import {
  CACHE_TTLS,
  buildCacheKey,
  cachedFetch,
  invalidateCache,
} from "@/lib/cache/redis";
import {
  ACCESS_LEVELS,
  CURRENT_TENURE,
  MODULES,
  type AccessLevel,
  type ModuleName,
  type UserRole,
} from "@/lib/constants";
import { connectMongoDB } from "@/lib/db/mongodb";
import {
  normalizeTenure,
  parseManagedModules,
  parseRoles,
  validateRoles,
} from "@/lib/users/roles";
import { normalizeLinkedInUrl } from "@/lib/users/socialLinks";
import {
  userQuerySchema,
  userQueryPipeline,
  type UserFilterInput,
} from "@/lib/users/query";
import { logger } from "@/lib/telemetry/logger";

import LoginSwitchRequest from "@/models/LoginSwitchRequest";
import CPUser from "@/models/CPUser";
import POTDSubmission from "@/models/POTDSubmission";
import User from "@/models/User";

export const getUsers = defineAction("getUsers", getUsersAction);
export const addUser = defineAction("addUser", addUserAction);
export const updateUserAccess = defineAction(
  "updateUserAccess",
  updateUserAccessAction,
);
export const updateUserRoles = defineAction(
  "updateUserRoles",
  updateUserRolesAction,
);
export const updateUserTenure = defineAction(
  "updateUserTenure",
  updateUserTenureAction,
);
export const deleteUser = defineAction("deleteUser", deleteUserAction);
export const updateUserPizzaCount = defineAction(
  "updateUserPizzaCount",
  updateUserPizzaCountAction,
);
export const updateProfile = defineAction("updateProfile", updateProfileAction);

export type AdminUserDto = {
  _id: string;
  name?: string;
  email: string;
  access?: AccessLevel;
  tenure?: string;
  managedModules?: ModuleName[];
  roles?: UserRole[];
  pizza_count?: number;
};

function adminUserDto(value: unknown): AdminUserDto {
  const user = value as Record<string, unknown>;
  return {
    _id: String(user._id),
    name: typeof user.name === "string" ? user.name : undefined,
    email: typeof user.email === "string" ? user.email : "",
    access: ACCESS_LEVELS.includes(user.access as AccessLevel)
      ? (user.access as AccessLevel)
      : undefined,
    tenure: typeof user.tenure === "string" ? user.tenure : undefined,
    managedModules: parseManagedModules(user.managedModules),
    roles: parseRoles(user.roles),
    pizza_count:
      typeof user.pizza_count === "number" ? user.pizza_count : undefined,
  };
}

// Returns the session if user is admin, or null if unauthorized
async function checkAdmin() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session || !isHead(session.user.access)) {
      logger.warn("Unauthorized admin access attempt", {
        action: "checkAdmin",
      });
      return null;
    }
    return session;
  } catch (err) {
    logger.error("checkAdmin error:", err);
    return null;
  }
}

async function getUsersAction(
  page = 1,
  limit = 50,
  search = "",
  filters: UserFilterInput = {},
) {
  try {
    const session = await checkAdmin();
    if (!session) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    const parsed = userQuerySchema.safeParse({
      ...filters,
      page,
      limit,
      q: search,
    });
    if (!parsed.success)
      return appError(
        "VALIDATION_ERROR",
        "Invalid member filters or pagination.",
      );
    const query = parsed.data;
    const cacheKey = buildCacheKey("users:admin:v2", {
      query: JSON.stringify(query),
    });
    const result = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
      const [result] = await User.aggregate<{
        users: unknown[];
        count: { total: number }[];
      }>(userQueryPipeline(query));
      return {
        users: result.users.map(adminUserDto),
        total: result.count[0]?.total ?? 0,
      };
    });

    return ok({ users: result.users, total: result.total });
  } catch (err) {
    logger.error("getUsers error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function addUserAction(
  email: string,
  name?: string,
  tenure = CURRENT_TENURE,
) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    const input = z
      .object({
        email: approvedEmailSchema,
        name: z.string().trim().max(160).optional(),
        tenure: z.string().refine((value) => normalizeTenure(value) !== null),
      })
      .safeParse({ email, name, tenure });
    if (!input.success)
      return appError(
        "VALIDATION_ERROR",
        "Use an institute or Gmail address and a consecutive tenure in YYYY-YY format.",
      );
    ({ email, name, tenure } = input.data);
    tenure = normalizeTenure(tenure)!;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return appError("CONFLICT", "User already exists");
    }

    const dbSession = await mongoose.startSession();
    let newUser;
    try {
      newUser = await auditedTransaction(dbSession, async (transaction) => {
        const [created] = await User.create(
          [
            {
              email,
              name: name || email.split("@")[0],
              access: "Member",
              tenure,
              managedModules: [],
              roles: [],
              emailVerified: true,
            },
          ],
          { session: transaction },
        );
        return {
          result: created,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "create" as const,
            operation: "users.create",
            target: {
              type: "user",
              id: String(created._id),
              label: created.name || "Member",
            },
            after: summarizeUser(
              created.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    logger.info("Admin user created", {
      action: "addUser",
      resourceId: newUser._id.toString(),
    });
    await invalidateCache("users");
    revalidatePath("/admin");
    return ok({ user: toBsonSafe(newUser) });
  } catch (err) {
    logger.error("addUser error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateUserAccessAction(
  userId: string,
  access: AccessLevel,
  managedModules: ModuleName[] = [],
) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    if (!ACCESS_LEVELS.includes(access))
      return appError("VALIDATION_ERROR", "Invalid access level.");
    const scoped = access === "Head" || access === "Core Team";
    if (
      scoped &&
      (!Array.isArray(managedModules) ||
        !managedModules.every((module) => MODULES.includes(module)))
    )
      return appError("VALIDATION_ERROR", "Invalid managed module.");
    const modules = scoped ? parseManagedModules(managedModules) : [];
    if (scoped && modules.length === 0)
      return appError(
        "VALIDATION_ERROR",
        `${access} access requires at least one managed module.`,
      );
    if (!(await User.exists({ _id: userId })))
      return appError("NOT_FOUND", "User not found");

    const update: Record<string, unknown> = { access, managedModules: modules };

    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during access update.");
        const updated = await User.findByIdAndUpdate(userId, update, {
          returnDocument: "after",
          runValidators: true,
          session: transaction,
        });
        if (!updated) throw new Error("User disappeared during access update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "update" as const,
            operation: "users.access.update",
            target: {
              type: "user",
              id: userId,
              label: updated.name || "Member",
            },
            before: summarizeUser(before as unknown as Record<string, unknown>),
            after: summarizeUser(
              updated.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!updatedUser) return appError("NOT_FOUND", "User not found");

    logger.info("User role updated", {
      action: "updateUserAccess",
      resourceId: userId,
      access,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    revalidatePath("/admin/users");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser) });
  } catch (err) {
    logger.error("updateUserRole error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateUserRolesAction(userId: string, roles: UserRole[]) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    const user = await User.findById(userId).select("access tenure").lean();
    if (!user) return appError("NOT_FOUND", "User not found");

    const validation = validateRoles(roles, user.tenure);
    if (!validation.success)
      return appError("VALIDATION_ERROR", validation.error);

    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during roles update.");
        const currentValidation = validateRoles(roles, before.tenure);
        if (!currentValidation.success)
          throw new AppResultError({
            code: "VALIDATION_ERROR",
            message: currentValidation.error,
          });
        const updated = await User.findByIdAndUpdate(
          userId,
          { roles: validation.roles },
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        );
        if (!updated) throw new Error("User disappeared during roles update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "update" as const,
            operation: "users.roles.update",
            target: {
              type: "user",
              id: userId,
              label: updated.name || "Member",
            },
            before: summarizeUser(before as unknown as Record<string, unknown>),
            after: summarizeUser(
              updated.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    logger.info("User module positions updated", {
      action: "updateUserRoles",
      resourceId: userId,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    revalidatePath("/admin/users");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser) });
  } catch (err) {
    if (err instanceof AppResultError)
      return { ok: false as const, error: err.detail };
    logger.error("updateUserModuleRoles error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateUserTenureAction(userId: string, value: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    const tenure = normalizeTenure(value);
    if (!tenure)
      return appError(
        "VALIDATION_ERROR",
        "Tenure must be a consecutive academic year in YYYY-YY format.",
      );
    await connectMongoDB();
    if (!(await User.exists({ _id: userId })))
      return appError("NOT_FOUND", "User not found");
    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during tenure update.");
        const validation = validateRoles(before.roles, tenure);
        if (!validation.success)
          throw new AppResultError({
            code: "VALIDATION_ERROR",
            message: validation.error,
          });
        const updated = await User.findByIdAndUpdate(
          userId,
          { tenure },
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        );
        if (!updated) throw new Error("User disappeared during tenure update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "update" as const,
            operation: "users.tenure.update",
            target: {
              type: "user",
              id: userId,
              label: updated.name || "Member",
            },
            before: summarizeUser(before as unknown as Record<string, unknown>),
            after: summarizeUser(
              updated.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!updatedUser) return appError("NOT_FOUND", "User not found");
    logger.info("User tenure updated", {
      action: "updateUserTenure",
      resourceId: userId,
      tenure,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    revalidatePath("/admin/users");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser) });
  } catch (err) {
    if (err instanceof AppResultError)
      return { ok: false as const, error: err.detail };
    logger.error("updateUserTenure error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function deleteUserAction(userId: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      revalidatePath("/admin");
      return ok({});
    }

    logger.warn("User deletion started", {
      action: "deleteUser",
      resourceId: userId,
    });

    const dbSession = await mongoose.startSession();
    let cascade = { cp: 0, potd: 0, sessions: 0, accounts: 0 };
    try {
      cascade = await auditedTransaction(dbSession, async (transaction) => {
        const current = await User.findById(userId).session(transaction).lean();
        if (!current) throw new Error("User disappeared during deletion.");
        await User.deleteOne({ _id: userId }, { session: transaction });
        const cpResult = await CPUser.deleteMany(
          { userId },
          { session: transaction },
        );
        const potdResult = await POTDSubmission.deleteMany(
          { userId },
          { session: transaction },
        );
        const authDeleted = await removeAuthRecords(userId, transaction);
        await LoginSwitchRequest.deleteMany(
          { userId },
          { session: transaction },
        );
        const result = {
          cp: cpResult.deletedCount,
          potd: potdResult.deletedCount,
          sessions: authDeleted.sessions,
          accounts: authDeleted.accounts,
        };
        return {
          result,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "delete" as const,
            operation: "users.delete",
            target: {
              type: "user",
              id: userId,
              label: current.name || "Member",
            },
            before: summarizeUser({
              ...current,
              cascadeCount: Object.values(result).reduce(
                (sum, value) => sum + value,
                0,
              ),
            } as unknown as Record<string, unknown>),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    const cpResult = { deletedCount: cascade.cp };
    const potdResult = { deletedCount: cascade.potd };
    logger.info("Related user records deleted", {
      action: "deleteUser",
      resourceId: userId,
      cpUserCount: cpResult.deletedCount,
      potdSubmissionCount: potdResult.deletedCount,
    });

    logger.info("Authentication records deleted", {
      action: "deleteUser",
      resourceId: userId,
      sessionCount: cascade.sessions,
      accountCount: cascade.accounts,
    });

    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/admin");
    revalidatePath("/");
    return ok({});
  } catch (err) {
    logger.error("deleteUser error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateUserPizzaCountAction(userId: string, delta: 1 | -1) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await connectMongoDB();

    const user = await User.findById(userId);
    if (!user) return appError("NOT_FOUND", "User not found");

    const newCount = Math.max(0, (user.pizza_count || 0) + delta);
    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during pizza update.");
        const updated = await User.findByIdAndUpdate(
          userId,
          { pizza_count: newCount },
          { returnDocument: "after", session: transaction },
        );
        if (!updated) throw new Error("User disappeared during pizza update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(adminSession.user),
            category: "users" as const,
            action: "update" as const,
            operation: "users.pizza_count.update",
            target: {
              type: "user",
              id: userId,
              label: updated.name || "Member",
            },
            before: summarizeUser(before as unknown as Record<string, unknown>),
            after: summarizeUser(
              updated.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    logger.info("User pizza count updated", {
      action: "updateUserPizzaCount",
      resourceId: userId,
      pizzaCount: newCount,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/admin");
    revalidatePath("/");
    return ok({ pizza_count: newCount });
  } catch (err) {
    logger.error("updateUserPizzaCount error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateProfileAction(data: {
  name: string;
  image?: string;
  codeforcesId?: string;
  atcoderId?: string;
  githubId?: string;
  linkedinUrl?: string;
  bio?: string;
  phoneNumber?: string;
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

    // Input validation
    const name = data.name?.trim();
    if (!name || name.length > 100) {
      return appError(
        "VALIDATION_ERROR",
        "Name is required and must be 100 characters or fewer.",
      );
    }

    // Validate image URL
    const image = data.image?.trim() || "";
    const AVATAR_URL_REGEX =
      /^\/api\/profile\/assets\/[0-9a-f]+\.(jpe?g|png|gif|webp|avif)$/i;
    if (image && !AVATAR_URL_REGEX.test(image)) {
      return appError("VALIDATION_ERROR", "Invalid profile image URL.");
    }

    const codeforcesId = data.codeforcesId?.trim() || "";
    if (codeforcesId.length > 50 || !/^[\w.-]*$/.test(codeforcesId)) {
      return appError(
        "VALIDATION_ERROR",
        "Codeforces ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      );
    }

    const atcoderId = data.atcoderId?.trim() || "";
    if (atcoderId.length > 50 || !/^[\w.-]*$/.test(atcoderId)) {
      return appError(
        "VALIDATION_ERROR",
        "AtCoder ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      );
    }

    const githubId = data.githubId?.trim() || "";
    if (githubId.length > 50 || !/^[\w.-]*$/.test(githubId)) {
      return appError(
        "VALIDATION_ERROR",
        "GitHub ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      );
    }

    const rawLinkedIn = data.linkedinUrl?.trim() || "";
    const linkedinUrl = rawLinkedIn ? normalizeLinkedInUrl(rawLinkedIn) : "";
    if (linkedinUrl === null) {
      return appError(
        "VALIDATION_ERROR",
        "LinkedIn URL must be a full https://linkedin.com profile link.",
      );
    }

    const bio = data.bio?.trim() || "";
    if (bio.length > 500) {
      return appError(
        "VALIDATION_ERROR",
        "Bio must be 500 characters or fewer.",
      );
    }

    const phoneNumber = data.phoneNumber?.trim() || "";
    if (phoneNumber.length > 20 || !/^[\d\s+()-]*$/.test(phoneNumber)) {
      return appError(
        "VALIDATION_ERROR",
        "Phone number must be 20 characters or fewer and contain only digits, spaces, +, (, ), or -.",
      );
    }

    await connectMongoDB();

    const dbSession = await mongoose.startSession();
    let updatedProfile;
    try {
      updatedProfile = await dbSession.withTransaction(async () => {
        // Check handle changes
        const currentUser = await User.findById(session.user.id)
          .select("codeforcesId atcoderId")
          .session(dbSession)
          .lean();
        if (!currentUser) return null;
        const handleChanged =
          codeforcesId !== (currentUser.codeforcesId?.trim() || "");
        const acHandleChanged =
          atcoderId !== (currentUser.atcoderId?.trim() || "");
        const updatedUser = await User.findByIdAndUpdate(
          session.user.id,
          {
            name,
            image,
            codeforcesId,
            atcoderId,
            githubId,
            linkedinUrl,
            bio,
            phoneNumber,
          },
          { returnDocument: "after", session: dbSession },
        );
        if (!updatedUser) return null;
        const verificationUpdate: Record<string, unknown> = {};
        // If the CF handle changed, revoke old verification
        if (handleChanged) {
          Object.assign(verificationUpdate, {
            cfHandle: codeforcesId,
            cfVerified: false,
            cfVerificationToken: "",
            cfVerificationRequestedAt: null,
          });
        }
        // If the AC handle changed, revoke old verification
        if (acHandleChanged) {
          Object.assign(verificationUpdate, {
            acHandle: atcoderId,
            acVerified: false,
            acVerificationToken: "",
            acVerificationRequestedAt: null,
          });
        }
        if (Object.keys(verificationUpdate).length) {
          await CPUser.updateOne(
            { userId: session.user.id },
            { $set: verificationUpdate },
            { session: dbSession },
          );
        }
        return {
          user: toBsonSafe(updatedUser),
          handleChanged,
          acHandleChanged,
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!updatedProfile) return appError("NOT_FOUND", "User not found.");

    // Retain replaced avatars because URLs do not establish file ownership
    logger.info("User profile updated", {
      action: "updateProfile",
      resourceId: session.user.id,
    });
    await invalidateCache("team");
    await invalidateCache("atlas");
    await invalidateCache("home");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/internal/dashboard");
    revalidatePath("/");
    revalidatePath("/team");
    return ok(updatedProfile);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return appError(
        "CONFLICT",
        "That platform handle is already linked to another member.",
      );
    }
    logger.error("updateProfile error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
