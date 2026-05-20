"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import { getClient } from "@/lib/mongodb";
import User from "@/models/User";
import CFUser from "@/models/CFUser";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/utils";
import { isAdmin, cleanUserRoles } from "@/lib/roles";
import { ObjectId } from "mongodb";

// Returns the session if user is admin, or null if unauthorized
async function checkAdmin() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session || !isAdmin((session.user as any).role)) {
      logger.warn(
        `Unauthorized admin access attempt by: ${session?.user?.email || "Unknown"}`,
      );
      return null;
    }
    return session;
  } catch (err) {
    logger.error("[user.ts] checkAdmin error:", err);
    return null;
  }
}

export async function getUsers() {
  try {
    const session = await checkAdmin();
    if (!session) return { success: false as const, error: "Unauthorized" };
    await dbConnect();
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    return { success: true as const, users: JSON.parse(JSON.stringify(users)) };
  } catch (err) {
    logger.error("[user.ts] getUsers error:", err);
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
      role: "Member",
      moduleRoles: [],
      emailVerified: true,
    });

    logger.info(`Admin ${adminSession.user.email} added user: ${email}`);
    revalidatePath("/admin");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(newUser)),
    };
  } catch (err) {
    logger.error("[user.ts] addUser error:", err);
    return { success: false as const, error: "Failed to add user." };
  }
}

export async function updateUserRole(userId: string, role: string) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const user = await User.findById(userId);
    if (!user) return { success: false as const, error: "User not found" };

    const cleanedModuleRoles = cleanUserRoles(role, user.moduleRoles);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { role, moduleRoles: cleanedModuleRoles },
      { new: true },
    );

    logger.info(
      `Admin ${adminSession.user.email} updated role of ${updatedUser.email} to ${role}`,
    );
    revalidatePath("/admin");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
    };
  } catch (err) {
    logger.error("[user.ts] updateUserRole error:", err);
    return { success: false as const, error: "Failed to update user role." };
  }
}

export async function updateUserModuleRoles(
  userId: string,
  moduleRoles: any[],
) {
  try {
    const adminSession = await checkAdmin();
    if (!adminSession)
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();

    const user = await User.findById(userId);
    if (!user) return { success: false as const, error: "User not found" };

    const cleanedModuleRoles = cleanUserRoles(user.role, moduleRoles);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { moduleRoles: cleanedModuleRoles },
      { new: true },
    );

    logger.info(
      `Admin ${adminSession.user.email} updated module roles of ${updatedUser.email}`,
    );
    revalidatePath("/admin");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
    };
  } catch (err) {
    logger.error("[user.ts] updateUserModuleRoles error:", err);
    return { success: false as const, error: "Failed to update module roles." };
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

    logger.warn(
      `Admin ${adminSession.user.email} deleted user: ${userToDelete.email}`,
    );

    await User.findByIdAndDelete(userId);

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

      logger.info(
        `[Auth] Cleaned up ${sessionsResult.deletedCount} session(s) and ` +
          `${accountsResult.deletedCount} account(s) for deleted user: ${userToDelete.email}`,
      );
    } catch (err) {
      logger.error(
        `[Auth] Failed to clean up sessions/accounts for deleted user ${userToDelete.email}:`,
        err,
      );
    }

    revalidatePath("/admin");
    return { success: true as const };
  } catch (err) {
    logger.error("[user.ts] deleteUser error:", err);
    return { success: false as const, error: "Failed to delete user." };
  }
}

export async function updateProfile(data: {
  name: string;
  codeforcesId?: string;
  githubId?: string;
  bio?: string;
  phoneNumber?: string;
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) return { success: false as const, error: "Unauthorized" };

    await dbConnect();

    // Check if the CF handle is being changed — if so, reset verification
    const currentUser = await User.findById(session.user.id).select("codeforcesId").lean() as any;
    const newHandle = data.codeforcesId?.trim() || "";
    const oldHandle = currentUser?.codeforcesId?.trim() || "";
    const handleChanged = newHandle !== oldHandle;

    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      {
        name: data.name,
        codeforcesId: newHandle,
        githubId: data.githubId || "",
        bio: data.bio || "",
        phoneNumber: data.phoneNumber || "",
      },
      { new: true },
    );

    // If the handle changed, revoke the old verification so the new handle must be re-verified
    if (handleChanged) {
      await CFUser.findOneAndUpdate(
        { userId: session.user.id },
        { $set: { cfVerified: false, cfVerificationToken: "", handle: newHandle } },
      );
      logger.info(`User ${session.user.email} changed CF handle from "${oldHandle}" to "${newHandle}" — verification reset`);
    }

    logger.info(`User ${session.user.email} updated their profile`);
    revalidatePath("/internal/dashboard");
    return {
      success: true as const,
      user: JSON.parse(JSON.stringify(updatedUser)),
      handleChanged,
    };
  } catch (err) {
    logger.error("[user.ts] updateProfile error:", err);
    return { success: false as const, error: "Failed to update profile." };
  }
}
