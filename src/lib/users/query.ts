import { z } from "zod";
import type { PipelineStage } from "mongoose";

import {
  ACCESS_LEVELS,
  AUTH_PROVIDERS,
  ROLE_CLUB_POSITIONS,
  ROLE_MODULES,
  MODULE_POSITIONS,
  MODULES,
  USER_SORT_FIELDS,
} from "@/lib/constants";
import { normalizeTenure } from "@/lib/users/roles";
import { prepareSearchQuery } from "@/lib/shared/search";
import { queryParamsWithDefaults } from "@/lib/shared/queryParams";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(1000000).optional(),
);
export const userQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    scope: z.enum(["all", "name", "email"]).default("all"),
    access: z.enum(["", "unassigned", ...ACCESS_LEVELS]).default(""),
    tenure: z
      .string()
      .trim()
      .refine(
        (value) =>
          !value || value === "unassigned" || normalizeTenure(value) !== null,
      )
      .default(""),
    position: z
      .enum(["", "unassigned", ...ROLE_CLUB_POSITIONS, ...MODULE_POSITIONS])
      .default(""),
    roleModule: z.enum(["", "unassigned", ...ROLE_MODULES]).default(""),
    managedModule: z.enum(["", "unassigned", ...MODULES]).default(""),
    provider: z.enum(["", "unassigned", ...AUTH_PROVIDERS]).default(""),
    minPizza: optionalNumber,
    maxPizza: optionalNumber,
    sort: z.enum(USER_SORT_FIELDS).default("createdAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    (value) =>
      value.minPizza === undefined ||
      value.maxPizza === undefined ||
      value.minPizza <= value.maxPizza,
    {
      message: "Minimum pizza count must not exceed maximum.",
      path: ["minPizza"],
    },
  );
export type UserQuery = z.infer<typeof userQuerySchema>;
export type UserFilterInput = Partial<Omit<UserQuery, "page" | "limit" | "q">>;
export const DEFAULT_USER_QUERY = userQuerySchema.parse({});
export const USER_QUERY_KEYS = Object.keys(DEFAULT_USER_QUERY).concat([
  "minPizza",
  "maxPizza",
]);

export function userQueryFromParams(params: {
  get(key: string): string | null;
}): UserQuery {
  const values = Object.fromEntries(
    USER_QUERY_KEYS.flatMap((key) => {
      const value = params.get(key);
      return value === null ? [] : [[key, value]];
    }),
  );
  const result = userQuerySchema.safeParse(values);
  return result.success ? result.data : DEFAULT_USER_QUERY;
}

export function userQueryParams(
  query: UserQuery,
  current = new URLSearchParams(),
): URLSearchParams {
  return queryParamsWithDefaults(
    query,
    { ...DEFAULT_USER_QUERY, minPizza: undefined, maxPizza: undefined },
    current,
  );
}

const arrayOrEmpty = (field: string) => ({
  $cond: [{ $isArray: `$${field}` }, `$${field}`, []],
});
const canonicalList = (input: unknown) => ({
  $reduce: {
    input: { $sortArray: { input, sortBy: 1 } },
    initialValue: "",
    in: {
      $concat: [
        "$$value",
        { $cond: [{ $eq: ["$$value", ""] }, "", " · "] },
        { $toLower: "$$this" },
      ],
    },
  },
});

/** Filtering and canonical sorting run in MongoDB before pagination */
export function userQueryPipeline(query: UserQuery): PipelineStage[] {
  const filters: Record<string, unknown>[] = [];
  const search = prepareSearchQuery(query.q);
  if (search)
    filters.push({
      $or: (query.scope === "all" ? ["name", "email"] : [query.scope]).map(
        (field) => ({ [field]: { $regex: search.pattern, $options: "i" } }),
      ),
    });
  for (const field of ["access", "tenure"] as const) {
    if (query[field])
      filters.push(
        query[field] === "unassigned"
          ? { [field]: { $in: [null, ""] } }
          : { [field]: query[field] },
      );
  }
  if (query.managedModule)
    filters.push(
      query.managedModule === "unassigned"
        ? { _managed: { $size: 0 } }
        : { _managed: query.managedModule },
    );
  if (query.provider)
    filters.push({
      _provider: query.provider === "unassigned" ? null : query.provider,
    });
  if (query.position === "unassigned") {
    filters.push({ _roles: { $size: 0 } });
    if (query.roleModule && query.roleModule !== "unassigned")
      filters.push({ _roles: { $elemMatch: { module: query.roleModule } } });
  } else if (query.position || query.roleModule) {
    const match: Record<string, unknown> = {};
    if (query.position) match.position = query.position;
    if (query.roleModule)
      match.module =
        query.roleModule === "unassigned"
          ? { $in: [null, ""] }
          : query.roleModule;
    filters.push(
      query.roleModule === "unassigned" && !query.position
        ? { $or: [{ _roles: { $size: 0 } }, { _roles: { $elemMatch: match } }] }
        : { _roles: { $elemMatch: match } },
    );
  }
  if (query.minPizza !== undefined || query.maxPizza !== undefined)
    filters.push({
      pizza_count: {
        ...(query.minPizza !== undefined ? { $gte: query.minPizza } : {}),
        ...(query.maxPizza !== undefined ? { $lte: query.maxPizza } : {}),
      },
    });
  const sortValues: Record<UserQuery["sort"], unknown> = {
    createdAt: "$createdAt",
    name: { $toLower: { $ifNull: ["$name", ""] } },
    email: { $toLower: { $ifNull: ["$email", ""] } },
    access: {
      $cond: [
        { $in: ["$access", [...ACCESS_LEVELS]] },
        { $indexOfArray: [[...ACCESS_LEVELS], "$access"] },
        null,
      ],
    },
    tenure: "$tenure",
    pizza_count: "$pizza_count",
    roles: canonicalList({
      $map: {
        input: "$_roles",
        as: "role",
        in: {
          $concat: [
            {
              $cond: [
                { $ifNull: ["$$role.module", false] },
                { $concat: ["$$role.module", " · "] },
                "",
              ],
            },
            "$$role.position",
          ],
        },
      },
    }),
    managedModules: canonicalList("$_managed"),
    provider: {
      $switch: {
        branches: [
          { case: { $eq: ["$_provider", "google"] }, then: "google" },
          { case: { $eq: ["$_provider", "microsoft"] }, then: "institute sso" },
        ],
        default: null,
      },
    },
  };
  return [
    {
      $set: {
        _managed: {
          $cond: [
            { $in: ["$access", ["Head", "Core Team"]] },
            arrayOrEmpty("managedModules"),
            [],
          ],
        },
        _provider: {
          $switch: {
            branches: [
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ["$email", ""] },
                    regex: /^[^@\s]+@iitg\.ac\.in$/i,
                  },
                },
                then: "microsoft",
              },
              {
                case: {
                  $regexMatch: {
                    input: { $ifNull: ["$email", ""] },
                    regex: /^[^@\s]+@gmail\.com$/i,
                  },
                },
                then: "google",
              },
            ],
            default: null,
          },
        },
      },
    },
    {
      $set: {
        _roles: {
          $setUnion: [
            arrayOrEmpty("roles"),
            {
              $map: {
                input: "$_managed",
                as: "module",
                in: { module: "$$module", position: "$access" },
              },
            },
          ],
        },
      },
    },
    ...(filters.length ? [{ $match: { $and: filters } }] : []),
    {
      $facet: {
        users: [
          { $set: { _sortValue: sortValues[query.sort] } },
          {
            $set: {
              _sortEmpty: {
                $cond: [
                  { $in: [{ $ifNull: ["$_sortValue", null] }, [null, ""]] },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $sort: {
              _sortEmpty: 1,
              _sortValue: query.direction === "asc" ? 1 : -1,
              _id: 1,
            },
          },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          {
            $project: {
              name: 1,
              email: 1,
              access: 1,
              roles: 1,
              managedModules: 1,
              tenure: 1,
              pizza_count: 1,
            },
          },
        ],
        count: [{ $count: "total" }],
      },
    },
  ];
}
