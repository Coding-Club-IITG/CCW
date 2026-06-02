"use server";

import { auth } from "@/lib/auth";
import {
  PROJECT_MODULES,
  PROJECT_STATUSES,
  type ProjectModuleName,
  type ProjectStatus,
} from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { isAdmin } from "@/lib/roles";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, 1));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function checkAdmin() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !isAdmin((session.user as any).role)) {
      logger.warn(
        `[Admin Projects] Unauthorized access attempt by: ${session?.user?.email || "Unknown"}`,
      );
      return null;
    }

    return session;
  } catch (err) {
    logger.error("[Admin Projects] checkAdmin error:", err);
    return null;
  }
}

export async function getProjects() {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const projects = await Project.find({}).sort({ date: -1 }).lean();

    return {
      success: true as const,
      projects: JSON.parse(JSON.stringify(projects)),
    };
  } catch (err) {
    logger.error("[Admin Projects] getProjects error:", err);
    return { success: false as const, error: "Failed to fetch projects." };
  }
}

export async function getProject(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const project = await Project.findById(id).lean();
    if (!project) {
      return { success: false as const, error: "Project not found." };
    }

    return {
      success: true as const,
      project: JSON.parse(JSON.stringify(project)),
    };
  } catch (err) {
    logger.error("[Admin Projects] getProject error:", err);
    return { success: false as const, error: "Failed to fetch project." };
  }
}

export async function createProject(formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    const title = getString(formData, "title");
    const description = getString(formData, "description");
    const repoLink = getString(formData, "repoLink");
    const coverImage = getString(formData, "coverImage");
    const dateInput = getString(formData, "date");
    const module = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTags(getString(formData, "tags"));

    if (
      !title ||
      !description ||
      !repoLink ||
      !dateInput ||
      !module ||
      !status
    ) {
      return {
        success: false as const,
        error:
          "Title, description, repo link, date, module, and status are required.",
      };
    }

    if (title.length > 200) {
      return {
        success: false as const,
        error: "Title must be 200 characters or fewer.",
      };
    }

    if (!PROJECT_MODULES.includes(module as ProjectModuleName)) {
      return { success: false as const, error: "Invalid module selected." };
    }

    if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
      return { success: false as const, error: "Invalid status selected." };
    }

    try {
      new URL(repoLink);
    } catch {
      return {
        success: false as const,
        error: "Repository link must be a valid URL.",
      };
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return { success: false as const, error: "Invalid project date." };
    }

    await dbConnect();
    const project = await Project.create({
      title,
      description,
      repoLink,
      coverImage,
      date,
      module,
      status,
      tags,
    });

    logger.info("[Admin Projects] Created project", {
      projectId: String(project._id),
      title,
      admin: session.user.email,
    });

    revalidatePath("/admin/projects");
    revalidatePath("/projects");

    return {
      success: true as const,
      project: JSON.parse(JSON.stringify(project)),
    };
  } catch (err) {
    logger.error("[Admin Projects] createProject error:", err);
    return { success: false as const, error: "Failed to create project." };
  }
}

export async function updateProject(id: string, formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    const title = getString(formData, "title");
    const description = getString(formData, "description");
    const repoLink = getString(formData, "repoLink");
    const coverImage = getString(formData, "coverImage");
    const dateInput = getString(formData, "date");
    const module = getString(formData, "module");
    const status = getString(formData, "status");
    const tags = parseTags(getString(formData, "tags"));

    if (
      !title ||
      !description ||
      !repoLink ||
      !dateInput ||
      !module ||
      !status
    ) {
      return {
        success: false as const,
        error:
          "Title, description, repo link, date, module, and status are required.",
      };
    }

    if (title.length > 200) {
      return {
        success: false as const,
        error: "Title must be 200 characters or fewer.",
      };
    }

    if (!PROJECT_MODULES.includes(module as ProjectModuleName)) {
      return { success: false as const, error: "Invalid module selected." };
    }

    if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
      return { success: false as const, error: "Invalid status selected." };
    }

    try {
      new URL(repoLink);
    } catch {
      return {
        success: false as const,
        error: "Repository link must be a valid URL.",
      };
    }

    const date = parseMonthInput(dateInput);
    if (!date) {
      return { success: false as const, error: "Invalid project date." };
    }

    await dbConnect();
    const project = await Project.findByIdAndUpdate(
      id,
      {
        title,
        description,
        repoLink,
        coverImage,
        date,
        module,
        status,
        tags,
      },
      { new: true },
    ).lean();

    if (!project) {
      return { success: false as const, error: "Project not found." };
    }

    logger.info("[Admin Projects] Updated project", {
      projectId: id,
      title,
      admin: session.user.email,
    });

    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${id}`);
    revalidatePath("/projects");

    return {
      success: true as const,
      project: JSON.parse(JSON.stringify(project)),
    };
  } catch (err) {
    logger.error("[Admin Projects] updateProject error:", err);
    return { success: false as const, error: "Failed to update project." };
  }
}

export async function deleteProject(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const project = await Project.findByIdAndDelete(id).lean();
    if (!project) {
      return { success: false as const, error: "Project not found." };
    }

    logger.info("[Admin Projects] Deleted project", {
      projectId: id,
      admin: session.user.email,
    });

    revalidatePath("/admin/projects");
    revalidatePath("/projects");

    return { success: true as const };
  } catch (err) {
    logger.error("[Admin Projects] deleteProject error:", err);
    return { success: false as const, error: "Failed to delete project." };
  }
}
