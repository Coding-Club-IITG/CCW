import { z } from "zod";

import {
  ROLE_CLUB_POSITIONS,
  ROLE_MODULES,
  FILE_SHARING_LIMIT,
  MODULES,
  MODULE_POSITIONS,
} from "@/lib/constants";
import { objectIdParamsSchema } from "./boundary";

export function createFileUploadSchema(maxBytes: number) {
  return z
    .file({ error: "No file provided." })
    .min(1, "No file provided.")
    .max(
      maxBytes,
      `File too large. Maximum file size is ${maxBytes / (1024 * 1024)} MiB.`,
    );
}

const id = objectIdParamsSchema.shape.id.transform((value) =>
  value.toLowerCase(),
);
const ids = z
  .array(id)
  .max(FILE_SHARING_LIMIT)
  .transform((values) => [...new Set(values)]);

export const fileAccessControlSchema = z
  .object({
    allMembers: z.boolean().default(false),
    allowedModules: z
      .array(z.enum(ROLE_MODULES))
      .max(ROLE_MODULES.length)
      .default([]),
    allowedClubPositions: z
      .array(z.enum(ROLE_CLUB_POSITIONS))
      .max(ROLE_CLUB_POSITIONS.length)
      .default([]),
    allowedModulePositions: z
      .array(z.enum(MODULE_POSITIONS))
      .max(MODULE_POSITIONS.length)
      .default([]),
    allowedUsers: ids.default([]),
    allowedGroups: ids.default([]),
  })
  .strict();

export const sharingGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).default(""),
    module: z.enum(MODULES).nullable().default(null),
    memberIds: ids,
  })
  .strict();

export const sharingGroupUpdateSchema = sharingGroupSchema.extend({
  version: z.number().int().nonnegative(),
});

export const sharingGroupDeleteSchema = z
  .object({
    version: z.number().int().nonnegative(),
  })
  .strict();

export const shareFileSchema = z
  .object({
    updatedAt: z.iso.datetime(),
    isDownloadable: z.boolean(),
    accessControl: fileAccessControlSchema,
  })
  .strict();
