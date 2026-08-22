"use server";

import { err as appError, ok } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";
import { toBsonSafe } from "@/lib/api/result";

export const getProjects = defineAction("getProjects", getProjectsAction);
export const getProject = defineAction("getProject", getProjectAction);
export const createProject = defineAction("createProject", createProjectAction);
export const updateProject = defineAction("updateProject", updateProjectAction);
export const deleteProject = defineAction("deleteProject", deleteProjectAction);

import { auth } from "@/lib/auth";
import {
  PROJECT_MODULES,
  PROJECT_STATUSES,
  type ProjectModuleName,
  type ProjectStatus,
} from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { isHead } from "@/lib/access/roles";
import { logger } from "@/lib/utils";
import { invalidateCache } from "@/lib/cache";
import Project from "@/models/Project";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
    const coverImage = getString(formData, "coverImage");
    const coverFocalPoint = parseImageFocalPoint({
      x: formData.get("coverFocalPointX"),
      y: formData.get("coverFocalPointY"),
    });
    const dateInput = getString(formData, "date");
    const projectModule = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTags(getString(formData, "tags"));

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

    try {
      new URL(repoLink);
    } catch {
      return appError(
        "VALIDATION_ERROR",
        "Repository link must be a valid URL.",
      );
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return appError("VALIDATION_ERROR", "Invalid project date.");
    }

    await dbConnect();
    const project = await Project.create({
      title,
      description,
      repoLink,
      coverImage,
      coverFocalPoint,
      date,
      module: projectModule,
      status,
      tags,
    });
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
    const coverImage = getString(formData, "coverImage");
    const coverFocalPoint = parseImageFocalPoint({
      x: formData.get("coverFocalPointX"),
      y: formData.get("coverFocalPointY"),
    });
    const dateInput = getString(formData, "date");
    const projectModule = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTags(getString(formData, "tags"));

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

    try {
      new URL(repoLink);
    } catch {
      return appError(
        "VALIDATION_ERROR",
        "Repository link must be a valid URL.",
      );
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return appError("VALIDATION_ERROR", "Invalid project date.");
    }

    await dbConnect();
    const project = await Project.findByIdAndUpdate(
      id,
      {
        title,
        description,
        repoLink,
        coverImage,
        coverFocalPoint,
        date,
        module: projectModule,
        status,
        tags,
      },
      { new: true },
    ).lean();

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
    const project = await Project.findByIdAndDelete(id).lean();
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
