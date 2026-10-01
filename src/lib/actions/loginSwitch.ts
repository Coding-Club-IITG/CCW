"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import {
  AppResultError,
  err,
  ok,
  type AppResult,
  validationError,
} from "@/lib/api/result";
import { auth } from "@/lib/auth/server";
import { invalidateCache } from "@/lib/cache/redis";
import { webEnv } from "@/lib/env/web";
import { LOGIN_SWITCH_STATUSES } from "@/lib/constants";
import {
  expireLoginSwitchRequests,
  mutateLoginSwitch,
  switchDto,
  type LoginRequestDto,
} from "@/lib/auth/loginSwitch";
import { consumeUserRateLimit } from "@/lib/users/rateLimit";

import LoginSwitchRequest from "@/models/LoginSwitchRequest";
import User from "@/models/User";

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);

async function safeMutation<T>(
  operation: () => Promise<T>,
): Promise<AppResult<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    if (error instanceof AppResultError)
      return err(error.detail.code, error.detail.message);
    throw error;
  }
}

export const getOwnLoginSwitch = defineAction("getOwnLoginSwitch", async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return err("UNAUTHENTICATED", "Sign in to continue.");
  await expireLoginSwitchRequests(session.user);
  const request = await LoginSwitchRequest.findOne({ userId: session.user.id })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return ok({ request: request ? switchDto(request) : null });
});

export const submitLoginSwitch = defineAction(
  "submitLoginSwitch",
  async (id: string) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return err("UNAUTHENTICATED", "Sign in to continue.");
    const input = idSchema.safeParse(id);
    if (!input.success) return validationError(input.error);
    if (
      !(await consumeUserRateLimit("login-switch-submit", session.user.id, 10))
        .allowed
    )
      return err("RATE_LIMITED", "Please wait a moment before trying again.");
    const result = await safeMutation(() =>
      mutateLoginSwitch(session.user, id, "submit", "", session.session.id),
    );
    revalidatePath("/internal/profile");
    revalidatePath("/admin/users");
    return result;
  },
);

export const cancelLoginSwitch = defineAction(
  "cancelLoginSwitch",
  async (id: string) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return err("UNAUTHENTICATED", "Sign in to continue.");
    const input = idSchema.safeParse(id);
    if (!input.success) return validationError(input.error);
    const result = await safeMutation(() =>
      mutateLoginSwitch(session.user, id, "cancel"),
    );
    revalidatePath("/internal/profile");
    revalidatePath("/admin/users");
    return result;
  },
);

export const listLoginSwitchRequests = defineAction(
  "listLoginSwitchRequests",
  async (query: { page?: number; status?: string } = {}) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return err("UNAUTHENTICATED", "Sign in to continue.");
    if (!isHead(session.user.access))
      return err("FORBIDDEN", "You cannot review login requests.");
    const parsed = z
      .object({
        page: z.number().int().min(1).max(100000).default(1),
        status: z
          .enum([
            ...LOGIN_SWITCH_STATUSES.filter((status) => status !== "draft"),
            "all",
          ])
          .default("pending"),
      })
      .strict()
      .safeParse(query);
    if (!parsed.success) return validationError(parsed.error);
    await expireLoginSwitchRequests(session.user, false);
    const filter = {
      submittedAt: { $ne: null },
      ...(parsed.data.status === "all"
        ? { status: { $ne: "draft" as const } }
        : { status: parsed.data.status }),
    };
    const [requests, total] = await Promise.all([
      LoginSwitchRequest.find(filter)
        .sort({ submittedAt: -1, _id: -1 })
        .skip((parsed.data.page - 1) * 20)
        .limit(20)
        .lean(),
      LoginSwitchRequest.countDocuments(filter),
    ]);
    const users = await User.find({
      _id: { $in: requests.map((request) => request.userId) },
    })
      .select("name pizza_count")
      .lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));
    const items: LoginRequestDto[] = requests.map((request) => {
      const user = byId.get(String(request.userId));
      return {
        ...switchDto(request),
        name: user?.name ?? "Member",
        pizza_count: user?.pizza_count ?? 0,
      };
    });
    return ok({ items, total });
  },
);

export const reviewLoginSwitch = defineAction(
  "reviewLoginSwitch",
  async (id: string, action: "approve" | "reject", reason = "") => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return err("UNAUTHENTICATED", "Sign in to continue.");
    if (!isHead(session.user.access))
      return err("FORBIDDEN", "You cannot review login requests.");
    if (action === "approve" && !webEnv.GOOGLE_CLIENT_ID)
      return err(
        "SERVICE_UNAVAILABLE",
        "Google sign-in must be configured before approving a switch.",
      );
    const input = z
      .object({
        id: idSchema,
        action: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300),
      })
      .strict()
      .safeParse({ id, action, reason });
    if (!input.success) return validationError(input.error);
    const result = await safeMutation(() =>
      mutateLoginSwitch(session.user, id, action, input.data.reason),
    );
    if (result.ok) {
      await invalidateCache("users");
      revalidatePath("/admin/users");
      revalidatePath("/internal/profile");
    }
    return result;
  },
);
