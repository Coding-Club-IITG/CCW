"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import { err as appError, ok, toBsonSafe } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import {
  PROJECT_MODULES,
  PROJECT_STATUSES,
  type ProjectModuleName,
  type ProjectStatus,
} from "@/lib/constants";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { parseTagList } from "@/lib/tagUtils";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";
import User from "@/models/User";

export const getProjects = defineAction("getProjects", getProjectsAction);
export const getProject = defineAction("getProject", getProjectAction);
export const createProject = defineAction("createProject", createProjectAction);
export const updateProject = defineAction("updateProject", updateProjectAction);
export const deleteProject = defineAction("deleteProject", deleteProjectAction);

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseMonthInput(value: string): Date | null {
  // Accept YYYY-MM (native input[type=month]) or MM/YYYY (manual entry)
  let year: number;
  let month: number;

  const isoMatch = value.match(/^(\d{4})-(\d{2})$/);
  const slashMatch = value.match(/^(\d{1,2})\/(\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    year = Number(slashMatch[2]);
  } else {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, 1));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const MAX_TAKEAWAYS = 6;
const MAX_TAKEAWAY_LENGTH = 200;

function parseTakeaways(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_TAKEAWAYS);
}

function parseContributors(value: string): string[] {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

async function checkAdmin() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !isHead(session.user.access)) {
      logger.warn("Unauthorized admin projects access attempt", {
        action: "checkAdmin",
      });
      return null;
    }

    return session;
  } catch (err) {
    logger.error("[Admin Projects] checkAdmin error:", err);
    return null;
  }
}

async function invalidateProjectCaches() {
  await Promise.all([
    invalidateCache("projects"),
    invalidateCache("admin:projects"),
  ]);
}

function validateProjectExtras(
  takeaways: string[],
  contributors: string[],
): string | null {
  if (takeaways.some((item) => item.length > MAX_TAKEAWAY_LENGTH)) {
    return `Each takeaway must be ${MAX_TAKEAWAY_LENGTH} characters or fewer.`;
  }
  if (contributors.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return "Invalid contributor selected.";
  }
  return null;
}

async function contributorsExist(contributors: string[]): Promise<boolean> {
  if (contributors.length === 0) return true;
  const found = await User.countDocuments({ _id: { $in: contributors } });
  return found === contributors.length;
}

async function getProjectsAction() {
  try {
    const session = await checkAdmin();
    if (!session) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }

    await dbConnect();
    const projects = await Project.find({}).sort({ date: -1 }).lean();

    return ok({ projects: toBsonSafe(projects) });
  } catch (err) {
    logger.error("[Admin Projects] getProjects error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function getProjectAction(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }

    await dbConnect();
    const project = await Project.findById(id).lean();
    if (!project) {
      return appError("NOT_FOUND", "Project not found.");
    }

    return ok({ project: toBsonSafe(project) });
  } catch (err) {
    logger.error("[Admin Projects] getProject error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function createProjectAction(formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }

    const title = getString(formData, "title");
    const description = getString(formData, "description");
    const repoLink = getString(formData, "repoLink");
    const liveUrl = getString(formData, "liveUrl");
    const coverImage = getString(formData, "coverImage");
    const coverFocalPoint = parseImageFocalPoint({
      x: formData.get("coverFocalPointX"),
      y: formData.get("coverFocalPointY"),
    });
    const dateInput = getString(formData, "date");
    const projectModule = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTagList(getString(formData, "tags"));
    const takeaways = parseTakeaways(getString(formData, "takeaways"));
    const contributors = parseContributors(getString(formData, "contributors"));

    if (
      !title ||
      !description ||
      !repoLink ||
      !dateInput ||
      !projectModule ||
      !status
    ) {
      return appError(
        "VALIDATION_ERROR",
        "Title, description, repo link, date, module, and status are required.",
      );
    }

    if (title.length > 200) {
      return appError(
        "VALIDATION_ERROR",
        "Title must be 200 characters or fewer.",
      );
    }

    if (!PROJECT_MODULES.includes(projectModule as ProjectModuleName)) {
      return appError("VALIDATION_ERROR", "Invalid module selected.");
    }

    if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
      return appError("VALIDATION_ERROR", "Invalid status selected.");
    }

    if (!isHttpUrl(repoLink)) {
      return appError(
        "VALIDATION_ERROR",
        "Repository link must be a valid HTTP or HTTPS URL.",
      );
    }

    if (liveUrl && !isHttpUrl(liveUrl)) {
      return appError(
        "VALIDATION_ERROR",
        "Live site URL must be a valid HTTP or HTTPS URL.",
      );
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return appError("VALIDATION_ERROR", "Invalid project date.");
    }

    const extrasError = validateProjectExtras(takeaways, contributors);
    if (extrasError) {
      return appError("VALIDATION_ERROR", extrasError);
    }

    await dbConnect();
    if (!(await contributorsExist(contributors))) {
      return appError("VALIDATION_ERROR", "Invalid contributor selected.");
    }
    const dbSession = await mongoose.startSession();
    let project;
    try {
      project = await auditedTransaction(dbSession, async (transaction) => {
        const [created] = await Project.create(
          [
            {
              title,
              description,
              repoLink,
              liveUrl: liveUrl || undefined,
              coverImage,
              coverFocalPoint,
              date,
              module: projectModule,
              status,
              tags,
              takeaways,
              contributors,
            },
          ],
          { session: transaction },
        );
        return {
          result: created,
          audit: {
            actor: auditActor(session.user),
            category: "projects" as const,
            action: "create" as const,
            operation: "projects.create",
            target: {
              type: "project",
              id: String(created._id),
              label: created.title,
            },
            after: summarizePublicContent(
              created.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await invalidateProjectCaches();

    logger.info("[Admin Projects] Created project", {
      projectId: String(project._id),
      title,
    });

    revalidatePath("/admin/projects");
    revalidatePath("/projects");

    return ok({ project: toBsonSafe(project) });
  } catch (err) {
    logger.error("[Admin Projects] createProject error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateProjectAction(id: string, formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }

    const title = getString(formData, "title");
    const description = getString(formData, "description");
    const repoLink = getString(formData, "repoLink");
    const liveUrl = getString(formData, "liveUrl");
    const coverImage = getString(formData, "coverImage");
    const coverFocalPoint = parseImageFocalPoint({
      x: formData.get("coverFocalPointX"),
      y: formData.get("coverFocalPointY"),
    });
    const dateInput = getString(formData, "date");
    const projectModule = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTagList(getString(formData, "tags"));
    const takeaways = parseTakeaways(getString(formData, "takeaways"));
    const contributors = parseContributors(getString(formData, "contributors"));

    if (
      !title ||
      !description ||
      !repoLink ||
      !dateInput ||
      !projectModule ||
      !status
    ) {
      return appError(
        "VALIDATION_ERROR",
        "Title, description, repo link, date, module, and status are required.",
      );
    }

    if (title.length > 200) {
      return appError(
        "VALIDATION_ERROR",
        "Title must be 200 characters or fewer.",
      );
    }

    if (!PROJECT_MODULES.includes(projectModule as ProjectModuleName)) {
      return appError("VALIDATION_ERROR", "Invalid module selected.");
    }

    if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
      return appError("VALIDATION_ERROR", "Invalid status selected.");
    }

    if (!isHttpUrl(repoLink)) {
      return appError(
        "VALIDATION_ERROR",
        "Repository link must be a valid HTTP or HTTPS URL.",
      );
    }

    if (liveUrl && !isHttpUrl(liveUrl)) {
      return appError(
        "VALIDATION_ERROR",
        "Live site URL must be a valid HTTP or HTTPS URL.",
      );
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return appError("VALIDATION_ERROR", "Invalid project date.");
    }

    const extrasError = validateProjectExtras(takeaways, contributors);
    if (extrasError) {
      return appError("VALIDATION_ERROR", extrasError);
    }

    await dbConnect();
    if (!(await Project.exists({ _id: id })))
      return appError("NOT_FOUND", "Project not found.");
    if (!(await contributorsExist(contributors))) {
      return appError("VALIDATION_ERROR", "Invalid contributor selected.");
    }
    const dbSession = await mongoose.startSession();
    let project;
    try {
      project = await auditedTransaction(dbSession, async (transaction) => {
        const before = await Project.findById(id).session(transaction).lean();
        if (!before) throw new Error("Project disappeared during update.");
        const updated = await Project.findByIdAndUpdate(
          id,
          {
            $set: {
              title,
              description,
              repoLink,
              coverImage,
              coverFocalPoint,
              date,
              module: projectModule,
              status,
              tags,
              takeaways,
              contributors,
              ...(liveUrl ? { liveUrl } : {}),
            },
            ...(liveUrl ? {} : { $unset: { liveUrl: 1 } }),
          },
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        ).lean();
        if (!updated) throw new Error("Project disappeared during update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(session.user),
            category: "projects" as const,
            action: "update" as const,
            operation: "projects.update",
            target: { type: "project", id, label: updated.title },
            before: summarizePublicContent(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizePublicContent(
              updated as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    if (!project) {
      return appError("NOT_FOUND", "Project not found.");
    }
    await invalidateProjectCaches();

    logger.info("[Admin Projects] Updated project", {
      projectId: id,
      title,
    });

    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${id}`);
    revalidatePath("/projects");

    return ok({ project: toBsonSafe(project) });
  } catch (err) {
    logger.error("[Admin Projects] updateProject error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function deleteProjectAction(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }

    await dbConnect();
    if (!(await Project.exists({ _id: id })))
      return appError("NOT_FOUND", "Project not found.");
    const dbSession = await mongoose.startSession();
    let project;
    try {
      project = await auditedTransaction(dbSession, async (transaction) => {
        const deleted = await Project.findByIdAndDelete(id, {
          session: transaction,
        }).lean();
        if (!deleted) throw new Error("Project disappeared during deletion.");
        return {
          result: deleted,
          audit: {
            actor: auditActor(session.user),
            category: "projects" as const,
            action: "delete" as const,
            operation: "projects.delete",
            target: { type: "project", id, label: deleted.title },
            before: summarizePublicContent(
              deleted as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!project) {
      return appError("NOT_FOUND", "Project not found.");
    }
    await invalidateProjectCaches();

    logger.info("[Admin Projects] Deleted project", {
      projectId: id,
    });

    revalidatePath("/admin/projects");
    revalidatePath("/projects");

    return ok({});
  } catch (err) {
    logger.error("[Admin Projects] deleteProject error:", err);
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
