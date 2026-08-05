"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import { getClient } from "@/lib/mongodb";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import POTDSubmission from "@/models/POTDSubmission";
import { revalidatePath } from "next/cache";
import {
  cachedFetch,
  buildCacheKey,
  CACHE_TTLS,
  invalidateCache,
} from "@/lib/cache";
import { logger } from "@/lib/utils";
import {
  isHead,
  normalizeTenure,
  parseManagedModules,
  validateRoles,
} from "@/lib/roles";
import {
  ACCESS_LEVELS,
  AccessLevel,
  CURRENT_TENURE,
  ModuleName,
  UserRole,
} from "@/lib/constants";
import { prepareSearchQuery } from "@/lib/search";
import { ObjectId } from "mongodb";

// Returns the session if user is admin, or null if unauthorized
async function checkAdmin() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session || !isHead((session.user as any).access)) {
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

export async function getUsers(page = 1, limit = 50, search = "") {
  try {
    const session = await checkAdmin();
    if (!session) return { success: false as const, error: "Unauthorized" };
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
      return { users: JSON.parse(JSON.stringify(users)), total };
    });

    return { success: true as const, users: result.users, total: result.total };
  } catch (err) {
    logger.error("getUsers error:", err);
    return { success: false as const, error: "Failed to fetch users." };
  }
}

export async function addUser(email: string, name?: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return { success: false as const, error: "User already exists" };
    }

    const newUser = await User.create({
      email,
      name: name || email.split("@")[0],
      access: "Member",
      tenure: CURRENT_TENURE,
      managedModules: [],
      roles: [],
      emailVerified: true,
    });

    logger.info("Admin user created", {
      action: "addUser",
      resourceId: newUser._id.toString(),
    });
    await invalidateCache("users");
    revalidatePath("/admin");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(newUser)),
    };
  } catch (err) {
    logger.error("addUser error:", err);
    return { success: false as const, error: "Failed to add user." };
  }
}

export async function updateUserAccess(
  userId: string,
  access: AccessLevel,
  managedModules: ModuleName[] = [],
) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    if (!ACCESS_LEVELS.includes(access))
      return { success: false as const, error: "Invalid access level." };
    const modules =
      access === "Head" ? parseManagedModules(managedModules) : [];
    if (access === "Head" && modules.length === 0)
      return {
        success: false as const,
        error: "Head access requires at least one managed module.",
      };

    const update: Record<string, unknown> = { access, managedModules: modules };
    if (access === "Head") update.roles = [];

    const updatedUser = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true,
    });
    if (!updatedUser)
      return { success: false as const, error: "User not found" };

    logger.info("User role updated", {
      action: "updateUserAccess",
      resourceId: userId,
      access,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    revalidatePath("/admin/users");
    revalidatePath("/team");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
    };
  } catch (err) {
    logger.error("updateUserRole error:", err);
    return { success: false as const, error: "Failed to update user access." };
  }
}

export async function updateUserRoles(userId: string, roles: UserRole[]) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const user = await User.findById(userId).select("access").lean();
    if (!user) return { success: false as const, error: "User not found" };
    if (user.access === "Head")
      return {
        success: false as const,
        error:
          "Head roles are generated from managed modules. Edit Head access instead.",
      };

    const validation = validateRoles(roles);
    if (!validation.success) return validation;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { roles: validation.roles },
      { new: true, runValidators: true },
    );

    logger.info("User module positions updated", {
      action: "updateUserRoles",
      resourceId: userId,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    revalidatePath("/admin/users");
    revalidatePath("/team");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
    };
  } catch (err) {
    logger.error("updateUserModuleRoles error:", err);
    return { success: false as const, error: "Failed to update roles." };
  }
}

export async function updateUserTenure(userId: string, value: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    const tenure = normalizeTenure(value);
    if (!tenure)
      return {
        success: false as const,
        error: "Tenure must be a consecutive academic year in YYYY-YY format.",
      };
    await dbConnect();
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { tenure },
      { new: true, runValidators: true },
    );
    if (!updatedUser)
      return { success: false as const, error: "User not found" };
    logger.info("User tenure updated", {
      action: "updateUserTenure",
      resourceId: userId,
      tenure,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    revalidatePath("/admin/users");
    revalidatePath("/team");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
    };
  } catch (err) {
    logger.error("updateUserTenure error:", err);
    return { success: false as const, error: "Failed to update tenure." };
  }
}

export async function deleteUser(userId: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      revalidatePath("/admin");
      return { success: true as const };
    }

    logger.warn("User deletion started", {
      action: "deleteUser",
      resourceId: userId,
    });

    await User.findByIdAndDelete(userId);

    // Cascade delete related documents
    const [cpResult, potdResult] = await Promise.all([
      CPUser.deleteMany({ userId }),
      POTDSubmission.deleteMany({ userId }),
    ]);
    logger.info("Related user records deleted", {
      action: "deleteUser",
      resourceId: userId,
      cpUserCount: cpResult.deletedCount,
      potdSubmissionCount: potdResult.deletedCount,
    });

    // Purge all sessions and linked accounts
    try {
      const mongoClient = await getClient();
      const db = mongoClient.db();

      let userIdQuery: ObjectId | string = userId;
      try {
        userIdQuery = new ObjectId(userId);
      } catch {
        userIdQuery = userId;
      }

      const [sessionsResult, accountsResult] = await Promise.all([
        db.collection("sessions").deleteMany({ userId: userIdQuery }),
        db.collection("accounts").deleteMany({ userId: userIdQuery }),
      ]);

      logger.info("Authentication records deleted", {
        action: "deleteUser",
        resourceId: userId,
        sessionCount: sessionsResult.deletedCount,
        accountCount: accountsResult.deletedCount,
      });
    } catch (err) {
      logger.error("Authentication record cleanup failed", {
        action: "deleteUser",
        resourceId: userId,
        err,
      });
    }

    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/admin");
    return { success: true as const };
  } catch (err) {
    logger.error("deleteUser error:", err);
    return { success: false as const, error: "Failed to delete user." };
  }
}

export async function updateUserPizzaCount(userId: string, delta: 1 | -1) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const user = await User.findById(userId);
    if (!user) return { success: false as const, error: "User not found" };

    const newCount = Math.max(0, (user.pizza_count || 0) + delta);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { pizza_count: newCount },
      { new: true },
    );

    logger.info("User pizza count updated", {
      action: "updateUserPizzaCount",
      resourceId: userId,
      pizzaCount: newCount,
    });
    await invalidateCache("users");
    await invalidateCache("team");
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/admin");
    return {
      success: true as const,
      pizza_count: newCount,
    };
  } catch (err) {
    logger.error("updateUserPizzaCount error:", err);
    return {
      success: false as const,
      error: "Failed to update pizza count.",
    };
  }
}

export async function updateProfile(data: {
  name: string;
  image?: string;
  codeforcesId?: string;
  atcoderId?: string;
  githubId?: string;
  bio?: string;
  phoneNumber?: string;
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) return { success: false as const, error: "Unauthorized" };

    // Input validation
    const name = data.name?.trim();
    if (!name || name.length > 100) {
      return {
        success: false as const,
        error: "Name is required and must be 100 characters or fewer.",
      };
    }

    // Validate image URL
    const image = data.image?.trim() || "";
    const AVATAR_URL_REGEX =
      /^\/api\/profile\/assets\/[0-9a-f]+\.(jpe?g|png|gif|webp|avif)$/i;
    if (image && !AVATAR_URL_REGEX.test(image)) {
      return {
        success: false as const,
        error: "Invalid profile image URL.",
      };
    }

    const codeforcesId = data.codeforcesId?.trim() || "";
    if (codeforcesId.length > 50 || !/^[\w.-]*$/.test(codeforcesId)) {
      return {
        success: false as const,
        error:
          "Codeforces ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      };
    }

    const atcoderId = data.atcoderId?.trim() || "";
    if (atcoderId.length > 50 || !/^[\w.-]*$/.test(atcoderId)) {
      return {
        success: false as const,
        error:
          "AtCoder ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      };
    }

    const githubId = data.githubId?.trim() || "";
    if (githubId.length > 50 || !/^[\w.-]*$/.test(githubId)) {
      return {
        success: false as const,
        error:
          "GitHub ID must be 50 characters or fewer and contain only letters, numbers, underscores, hyphens, or periods.",
      };
    }

    const bio = data.bio?.trim() || "";
    if (bio.length > 500) {
      return {
        success: false as const,
        error: "Bio must be 500 characters or fewer.",
      };
    }

    const phoneNumber = data.phoneNumber?.trim() || "";
    if (phoneNumber.length > 20 || !/^[\d\s+()-]*$/.test(phoneNumber)) {
      return {
        success: false as const,
        error:
          "Phone number must be 20 characters or fewer and contain only digits, spaces, +, (, ), or -.",
      };
    }

    await dbConnect();

    // Check if CF or AC handles changed
    const currentUser = (await User.findById(session.user.id)
      .select("codeforcesId atcoderId image")
      .lean()) as any;
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
          const avatarDir =
            process.env.AVATAR_UPLOAD_DIR ??
            pathMod.default.join(process.cwd(), "uploads", "avatars");
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
    await invalidateCache("cp");
    await invalidateCache("potd");
    revalidatePath("/internal/dashboard");
    revalidatePath("/team");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
      handleChanged,
    };
  } catch (err) {
    logger.error("updateProfile error:", err);
    return { success: false as const, error: "Failed to update profile." };
  }
}
