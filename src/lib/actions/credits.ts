"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeCredits } from "@/lib/audit/summary";
import { err as appError, ok } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import {
  CREDIT_LIMITS,
  CreditSection,
  CreditSectionInput,
  shuffleCreditEntries,
} from "@/lib/credits";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, getDisplayName, logger } from "@/lib/utils";
import Credits from "@/models/Credits";
import User from "@/models/User";

export const getCredits = defineAction("getCredits", getCreditsAction);
export const saveCredits = defineAction("saveCredits", saveCreditsAction);

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user as
    { id: string; name?: string; access?: string } | undefined;
}

async function getCreditsAction() {
  try {
    if (!(await getSessionUser()))
      return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const credits = await Credits.findOne({ key: "main" }).lean();
    if (!credits) return ok([] as CreditSection[]);

    const userIds = credits.sections.flatMap((section) =>
      section.entries.map((entry) => entry.user),
    );
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name image pizza_count")
      .lean();
    const userMap = new Map(
      users.map((user) => [
        user._id.toString(),
        {
          name: getDisplayName(user.name || "Member", user.pizza_count),
          image: user.image || null,
        },
      ]),
    );

    const data: CreditSection[] = credits.sections.map((section) => ({
      heading: section.heading,
      entries: shuffleCreditEntries(
        section.entries.flatMap((entry) => {
          const userId = entry.user.toString();
          const user = userMap.get(userId);
          return user ? [{ userId, period: entry.period, ...user }] : [];
        }),
      ),
    }));

    return ok(data);
  } catch (error) {
    logger.error("Credits fetch failed", {
      action: "getCredits",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
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

async function saveCreditsAction(input: unknown) {
  try {
    const user = await getSessionUser();
    if (!user || !isHead(user.access))
      return appError("UNAUTHENTICATED", "Unauthorized");

    const validated = validateSections(input);
    if ("error" in validated)
      return appError("INTERNAL_ERROR", "An unexpected error occurred.");

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
      return appError("INTERNAL_ERROR", "An unexpected error occurred.");

    const session = await mongoose.startSession();
    try {
      await auditedTransaction(session, async (transaction) => {
        const previous = await Credits.findOne({ key: "main" })
          .session(transaction)
          .lean();
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
          { upsert: true, runValidators: true, session: transaction },
        );
        return {
          result: undefined,
          audit: {
            actor: auditActor(user),
            category: "credits" as const,
            action: "update" as const,
            operation: "credits.update",
            target: { type: "credits", id: "main", label: "Website credits" },
            before: summarizeCredits(previous?.sections ?? []),
            after: summarizeCredits(validated.sections),
          },
        };
      });
    } finally {
      await session.endSession();
    }
    revalidatePath("/", "layout");
    logger.info("Credits updated", { action: "saveCredits", actorId: user.id });
    return ok({});
  } catch (error) {
    logger.error("Credits update failed", {
      action: "saveCredits",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
