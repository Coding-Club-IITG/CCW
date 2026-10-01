import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  DEFAULT_USER_QUERY,
  userQueryFromParams,
  userQueryParams,
  userQueryPipeline,
  userQuerySchema,
} from "@/lib/userQuery";
import User from "@/models/User";
import {
  startTestMongo,
  clearTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function query(input: Record<string, unknown>) {
  const [result] = await User.aggregate(
    userQueryPipeline(userQuerySchema.parse(input)),
  );
  return {
    names: result.users.map((user: { name: string }) => user.name),
    total: result.count[0]?.total ?? 0,
  };
}
async function fixtures() {
  await User.create([
    {
      name: "alice",
      email: "alice@gmail.com",
      tenure: "2018-19",
      access: "Member",
      roles: [
        { module: "Design", position: "Core Team" },
        { module: "Cybersecurity", position: "Coordinator" },
      ],
      pizza_count: 4,
    },
    {
      name: "Bob",
      email: "bob@iitg.ac.in",
      tenure: "2025-26",
      access: "Head",
      managedModules: ["Design"],
      pizza_count: 12,
    },
    {
      name: "Charlie",
      email: "charlie@iitg.ac.in",
      tenure: "2024-25",
      access: "Admin",
      roles: [{ position: "Secretary" }],
      pizza_count: 0,
    },
    {
      name: "delta",
      email: "delta@gmail.com",
      tenure: "2026-27",
      pizza_count: 2,
    },
  ]);
}

describe("server member filtering and sorting", () => {
  beforeAll(startTestMongo);
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("matches every management filter, with module and position on the same role", async () => {
    await fixtures();
    const cases = [
      [{ q: "ALICE", scope: "name" }, ["alice"]],
      [
        { q: "gmail", scope: "email", sort: "name", direction: "asc" },
        ["alice", "delta"],
      ],
      [{ access: "Head" }, ["Bob"]],
      [{ tenure: "2018-19" }, ["alice"]],
      [{ position: "Secretary" }, ["Charlie"]],
      [{ roleModule: "Design", position: "Head" }, ["Bob"]],
      [{ roleModule: "Design", position: "Coordinator" }, []],
      [{ roleModule: "Design", position: "Core Team" }, ["alice"]],
      [{ managedModule: "Design" }, ["Bob"]],
      [{ provider: "google", minPizza: 3, maxPizza: 5 }, ["alice"]],
      [{ position: "unassigned" }, ["delta"]],
      [
        { roleModule: "unassigned", sort: "name", direction: "asc" },
        ["Charlie", "delta"],
      ],
      [{ managedModule: "unassigned", provider: "microsoft" }, ["Charlie"]],
      [{ minPizza: 0, maxPizza: 0 }, ["Charlie"]],
    ] as const;
    for (const [input, expected] of cases)
      expect((await query(input)).names, JSON.stringify(input)).toEqual(
        expected,
      );
  });

  it("sorts all fields canonically, leaves empty values last in either direction and counts before pagination", async () => {
    await fixtures();
    const cases: [string, string[]][] = [
      ["name", ["alice", "Bob", "Charlie", "delta"]],
      ["email", ["alice", "Bob", "Charlie", "delta"]],
      ["access", ["alice", "delta", "Bob", "Charlie"]],
      ["tenure", ["alice", "Charlie", "Bob", "delta"]],
      ["pizza_count", ["Charlie", "delta", "alice", "Bob"]],
      ["roles", ["alice", "Bob", "Charlie", "delta"]],
      ["managedModules", ["Bob", "alice", "Charlie", "delta"]],
      ["provider", ["alice", "delta", "Bob", "Charlie"]],
    ];
    for (const [sort, expected] of cases)
      expect((await query({ sort, direction: "asc" })).names, sort).toEqual(
        expected,
      );
    expect((await query({ sort: "roles", direction: "desc" })).names).toEqual([
      "Charlie",
      "Bob",
      "alice",
      "delta",
    ]);
    expect(
      (await query({ sort: "managedModules", direction: "desc" })).names,
    ).toEqual(["Bob", "alice", "Charlie", "delta"]);
    expect(
      await query({ sort: "name", direction: "asc", limit: 2, page: 2 }),
    ).toEqual({ names: ["Charlie", "delta"], total: 4 });
    expect(
      await query({
        provider: "google",
        sort: "name",
        direction: "asc",
        limit: 1,
        page: 2,
      }),
    ).toEqual({ names: ["delta"], total: 2 });
  });

  it("keeps newest-added-first as the default", async () => {
    await User.collection.insertMany([
      {
        name: "Older",
        email: "older@gmail.com",
        createdAt: new Date("2020-01-01"),
      },
      {
        name: "Newer",
        email: "newer@gmail.com",
        createdAt: new Date("2025-01-01"),
      },
      { name: "Missing date", email: "undated@gmail.com" },
    ]);
    expect((await query({})).names).toEqual(["Newer", "Older", "Missing date"]);
  });

  it("sorts missing values last and uses IDs to break equal values", async () => {
    await fixtures();
    await User.collection.insertOne({ name: "Empty" });
    expect(
      (await query({ sort: "tenure", direction: "desc" })).names.at(-1),
    ).toBe("Empty");
    expect(
      (await query({ sort: "pizza_count", direction: "desc" })).names.at(-1),
    ).toBe("Empty");
    expect(
      (
        await query({
          tenure: "unassigned",
          access: "unassigned",
          provider: "unassigned",
        })
      ).names,
    ).toEqual(["Empty"]);
    const repeated = await query({
      sort: "provider",
      direction: "desc",
      page: 2,
      limit: 2,
    });
    expect(
      await query({ sort: "provider", direction: "desc", page: 2, limit: 2 }),
    ).toEqual(repeated);
  });

  it("validates query bounds, round-trips applied URLs and isolates complete cache keys", async () => {
    const { buildCacheKey } = await import("@/lib/cache");
    for (const invalid of [
      { minPizza: -1 },
      { maxPizza: "abc" },
      { minPizza: 10, maxPizza: 2 },
      { page: 0 },
      { page: 1.5 },
      { limit: 101 },
      { tenure: "2020-25" },
      { provider: "github" },
      { scope: "bio" },
      { sort: "phoneNumber" },
      { q: "a".repeat(101) },
      { unexpected: true },
    ])
      expect(userQuerySchema.safeParse(invalid).success).toBe(false);
    const applied = userQuerySchema.parse({
      q: "alumni",
      scope: "email",
      access: "Member",
      tenure: "2018-19",
      position: "Core Team",
      roleModule: "Design",
      managedModule: "unassigned",
      minPizza: 0,
      maxPizza: 7,
      provider: "google",
      sort: "tenure",
      direction: "asc",
      page: 3,
    });
    const url = userQueryParams(
      applied,
      new URLSearchParams("view=members&unrelated=kept"),
    );
    expect(url.get("unrelated")).toBe("kept");
    expect(userQueryFromParams(url)).toEqual(applied);
    expect(
      userQueryFromParams(userQueryParams(DEFAULT_USER_QUERY, url)),
    ).toEqual(DEFAULT_USER_QUERY);
    const base = buildCacheKey("users:admin:v2", {
      query: JSON.stringify(applied),
    });
    for (const field of [
      "q",
      "scope",
      "access",
      "tenure",
      "position",
      "roleModule",
      "managedModule",
      "provider",
      "minPizza",
      "maxPizza",
      "sort",
      "direction",
      "page",
      "limit",
    ] as const)
      expect(
        buildCacheKey("users:admin:v2", {
          query: JSON.stringify({ ...applied, [field]: "different" }),
        }),
      ).not.toBe(base);
  });

  it("adds historical alumni with Member permissions and keeps defaults for existing callers", async () => {
    getSession.mockResolvedValue({
      user: { id: "admin", access: "Admin", name: "Admin" },
    });
    const { addUser } = await import("@/lib/actions/user");
    expect(
      await addUser(" ALUMNI@GMAIL.COM ", "Alumni", "2017-18"),
    ).toMatchObject({ ok: true });
    expect(
      await User.findOne({ email: "alumni@gmail.com" }).lean(),
    ).toMatchObject({
      access: "Member",
      tenure: "2017-18",
      roles: [],
      managedModules: [],
    });
    expect(await addUser("student@iitg.ac.in")).toMatchObject({ ok: true });
    expect(await addUser("student@outlook.com")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await addUser("other@gmail.com", "Other", "2017-19")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
