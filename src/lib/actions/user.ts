"use server";

import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeUser } from "@/lib/audit/summary";
import { err as appError, ok, toBsonSafe } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import {
  CACHE_TTLS,
  buildCacheKey,
  cachedFetch,
  invalidateCache,
} from "@/lib/cache";
import {
  ACCESS_LEVELS,
  CURRENT_TENURE,
  type AccessLevel,
  type ModuleName,
  type UserRole,
} from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import dbConnect, { getClient } from "@/lib/mongodb";
import {
  normalizeTenure,
  parseManagedModules,
  parseRoles,
  validateRoles,
} from "@/lib/roles";
import { normalizeLinkedInUrl } from "@/lib/socialLinks";
import { prepareSearchQuery } from "@/lib/search";
import { logger } from "@/lib/utils";
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

async function getUsersAction(page = 1, limit = 50, search = "") {
  try {
    const session = await checkAdmin();
    if (!session) return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();

    const preparedSearch = prepareSearchQuery(search);
    const filter = preparedSearch
      ? {
          $or: [
            { name: { $regex: preparedSearch.pattern, $options: "i" } },
            { email: { $regex: preparedSearch.pattern, $options: "i" } },
          ],
        }
      : {};
    const cacheKey = buildCacheKey("users:admin", {
      page,
      limit,
      search: preparedSearch?.query,
    });
    const skip = (page - 1) * limit;

    const result = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
      const [users, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ]);
      return { users: users.map(adminUserDto), total };
    });

    return ok({ users: result.users, total: result.total });
  } catch (err) {
    logger.error("getUsers error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function addUserAction(email: string, name?: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();

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
              tenure: CURRENT_TENURE,
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
    await dbConnect();

    if (!ACCESS_LEVELS.includes(access))
      return appError("VALIDATION_ERROR", "Invalid access level.");
    const modules =
      access === "Head" ? parseManagedModules(managedModules) : [];
    if (access === "Head" && modules.length === 0)
      return appError(
        "VALIDATION_ERROR",
        "Head access requires at least one managed module.",
      );
    if (!(await User.exists({ _id: userId })))
      return appError("NOT_FOUND", "User not found");

    const update: Record<string, unknown> = { access, managedModules: modules };
    if (access === "Head") update.roles = [];

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
    await dbConnect();

    const user = await User.findById(userId).select("access").lean();
    if (!user) return appError("NOT_FOUND", "User not found");
    if (user.access === "Head")
      return appError("INTERNAL_ERROR", "An unexpected error occurred.");

    const validation = validateRoles(roles);
    if (!validation.success)
      return appError("VALIDATION_ERROR", validation.error);

    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during roles update.");
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
    await invalidateCache("home");
    revalidatePath("/admin/users");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser) });
  } catch (err) {
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
    await dbConnect();
    if (!(await User.exists({ _id: userId })))
      return appError("NOT_FOUND", "User not found");
    const dbSession = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await auditedTransaction(dbSession, async (transaction) => {
        const before = await User.findById(userId).session(transaction).lean();
        if (!before) throw new Error("User disappeared during tenure update.");
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
    await invalidateCache("home");
    revalidatePath("/admin/users");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser) });
  } catch (err) {
    logger.error("updateUserTenure error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function deleteUserAction(userId: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession) return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();

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
        const mongoClient = await getClient();
        const db = mongoClient.db();
        let userIdQuery: ObjectId | string = userId;
        try {
          userIdQuery = new ObjectId(userId);
        } catch {
          userIdQuery = userId;
        }
        const driverSession =
          transaction as unknown as import("mongodb").ClientSession;
        const sessionsResult = await db
          .collection("sessions")
          .deleteMany({ userId: userIdQuery }, { session: driverSession });
        const accountsResult = await db
          .collection("accounts")
          .deleteMany({ userId: userIdQuery }, { session: driverSession });
        const result = {
          cp: cpResult.deletedCount,
          potd: potdResult.deletedCount,
          sessions: sessionsResult.deletedCount,
          accounts: accountsResult.deletedCount,
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
    await dbConnect();

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

    await dbConnect();

    // Check if CF or AC handles changed
    const currentUser = await User.findById(session.user.id)
      .select("codeforcesId atcoderId image")
      .lean();
    const oldCfHandle = currentUser?.codeforcesId?.trim() || "";
    const oldAcHandle = currentUser?.atcoderId?.trim() || "";
    const oldImage = currentUser?.image || "";
    const handleChanged = codeforcesId !== oldCfHandle;
    const acHandleChanged = atcoderId !== oldAcHandle;

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
      { new: true },
    );

    // Delete old avatar file if image changed
    if (
      oldImage &&
      oldImage !== image &&
      oldImage.startsWith("/api/profile/assets/")
    ) {
      try {
        const oldFilename = oldImage.split("/").pop();
        if (oldFilename) {
          const { unlink } = await import("fs/promises");
          const pathMod = await import("path");
          const avatarDir = pathMod.default.resolve(webEnv.AVATAR_UPLOAD_DIR);
          const filePath = pathMod.default.join(avatarDir, oldFilename);
          await unlink(filePath).catch(() => {});
        }
      } catch {
        // Best-effort deletion
      }
    }

    // If the CF handle changed, revoke old verification
    if (handleChanged) {
      await CPUser.findOneAndUpdate(
        { userId: session.user.id },
        {
          $set: {
            cfVerified: false,
            cfVerificationToken: "",
            cfHandle: codeforcesId,
          },
        },
      );
      logger.info("Codeforces handle change reset verification", {
        action: "updateProfile",
        resourceId: session.user.id,
      });
    }

    // If the AC handle changed, revoke old verification
    if (acHandleChanged) {
      await CPUser.findOneAndUpdate(
        { userId: session.user.id },
        {
          $set: {
            acVerified: false,
            acVerificationToken: "",
            acHandle: atcoderId,
          },
        },
      );
      logger.info("AtCoder handle change reset verification", {
        action: "updateProfile",
        resourceId: session.user.id,
      });
    }

    logger.info("User profile updated", {
      action: "updateProfile",
      resourceId: session.user.id,
    });
    await invalidateCache("team");
    await invalidateCache("home");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/internal/dashboard");
    revalidatePath("/");
    revalidatePath("/team");
    return ok({ user: toBsonSafe(updatedUser), handleChanged });
  } catch (err) {
    logger.error("updateProfile error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
