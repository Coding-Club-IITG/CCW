"use server";

import mongoose from "mongoose";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  CREDIT_LIMITS,
  CreditSection,
  CreditSectionInput,
} from "@/lib/credits";
import dbConnect from "@/lib/mongodb";
import { isHead } from "@/lib/roles";
import { errorToLogMetadata, getDisplayName, logger } from "@/lib/utils";
import Credits from "@/models/Credits";
import User from "@/models/User";

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user as { id: string; access?: string } | undefined;
}

export async function getCredits() {
  try {
    if (!(await getSessionUser()))
      return { success: false as const, error: "Unauthorized" };

    await dbConnect();
    const credits = await Credits.findOne({ key: "main" }).lean();
    if (!credits)
      return { success: true as const, data: [] as CreditSection[] };

    const userIds = credits.sections.flatMap((section: any) =>
      section.entries.map((entry: any) => entry.user),
    );
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name image pizza_count")
      .lean();
    const userMap = new Map(
      users.map((user: any) => [
        user._id.toString(),
        {
          name: getDisplayName(user.name || "Member", user.pizza_count),
          image: user.image || null,
        },
      ]),
    );

    const data: CreditSection[] = credits.sections.map((section: any) => ({
      heading: section.heading,
      entries: section.entries.flatMap((entry: any) => {
        const userId = entry.user.toString();
        const user = userMap.get(userId);
        return user ? [{ userId, period: entry.period, ...user }] : [];
      }),
    }));

    return { success: true as const, data };
  } catch (error) {
    logger.error("Credits fetch failed", {
      action: "getCredits",
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to load credits." };
  }
}

function validateSections(input: unknown) {
  if (!Array.isArray(input) || input.length > CREDIT_LIMITS.sections)
    return { error: "Invalid credits sections." } as const;

  const sections: CreditSectionInput[] = [];
  const seenHeadings = new Set<string>();
  for (const rawSection of input) {
    if (!rawSection || typeof rawSection !== "object")
      return { error: "Invalid credits section." } as const;
    const section = rawSection as Record<string, unknown>;
    const heading =
      typeof section.heading === "string" ? section.heading.trim() : "";
    if (!heading || heading.length > CREDIT_LIMITS.headingLength)
      return {
        error: "Each heading must be between 1 and 80 characters.",
      } as const;
    const headingKey = heading.toLocaleLowerCase();
    if (seenHeadings.has(headingKey))
      return { error: "Credit headings must be unique." } as const;
    seenHeadings.add(headingKey);
    if (
      !Array.isArray(section.entries) ||
      section.entries.length > CREDIT_LIMITS.entriesPerSection
    )
      return { error: `Invalid contributors for ${heading}.` } as const;

    const entries: CreditSectionInput["entries"] = [];
    const seenUsers = new Set<string>();
    for (const rawEntry of section.entries) {
      if (!rawEntry || typeof rawEntry !== "object")
        return { error: `Invalid contributor in ${heading}.` } as const;
      const entry = rawEntry as Record<string, unknown>;
      const userId = typeof entry.userId === "string" ? entry.userId : "";
      const period =
        typeof entry.period === "string" ? entry.period.trim() : "";
      if (
        !mongoose.isValidObjectId(userId) ||
        !period ||
        period.length > CREDIT_LIMITS.periodLength
      )
        return { error: `Invalid contributor in ${heading}.` } as const;
      if (seenUsers.has(userId))
        return {
          error: `A person can only appear once in ${heading}.`,
        } as const;
      seenUsers.add(userId);
      entries.push({ userId, period });
    }
    sections.push({ heading, entries });
  }
  return { sections } as const;
}

export async function saveCredits(input: unknown) {
  try {
    const user = await getSessionUser();
    if (!user || !isHead(user.access))
      return { success: false as const, error: "Unauthorized" };

    const validated = validateSections(input);
    if ("error" in validated)
      return { success: false as const, error: validated.error };

    await dbConnect();
    const userIds = [
      ...new Set(
        validated.sections.flatMap((section) =>
          section.entries.map((entry) => entry.userId),
        ),
      ),
    ];
    const existingUsers = await User.countDocuments({ _id: { $in: userIds } });
    if (existingUsers !== userIds.length)
      return {
        success: false as const,
        error: "One or more selected users no longer exist.",
      };

    await Credits.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          sections: validated.sections.map((section) => ({
            heading: section.heading,
            entries: section.entries.map((entry) => ({
              user: entry.userId,
              period: entry.period,
            })),
          })),
        },
      },
      { upsert: true, runValidators: true },
    );
    revalidatePath("/", "layout");
    logger.info("Credits updated", { action: "saveCredits", actorId: user.id });
    return { success: true as const };
  } catch (error) {
    logger.error("Credits update failed", {
      action: "saveCredits",
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to save credits." };
  }
}
