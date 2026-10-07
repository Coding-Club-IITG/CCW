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
  CURRENT_TENURE,
  type AccessLevel,
  type ModuleName,
} from "@/lib/constants";
import { publicTeamFilter } from "@/lib/users/team";
import { userQueryPipeline, userQuerySchema } from "@/lib/users/query";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

vi.mock("server-only", () => ({}));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cache/redis", () => ({ invalidateCache: vi.fn() }));

describe("Core Team access and historical assignments", () => {
  beforeAll(startTestMongo);
  afterAll(stopTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  const signIn = (access: AccessLevel = "Admin") =>
    getSession.mockResolvedValue({
      user: { id: "admin", name: "Admin", access },
    });

  it("preserves stored roles through every access transition and audits each change", async () => {
    signIn();
    const { updateUserAccess, updateUserRoles } =
      await import("@/lib/actions/users");
    const user = await User.create({
      name: "Returning member",
      roles: [{ position: "Secretary" }],
    });
    for (const access of ["Core Team", "Head", "Admin", "Member"] as const) {
      expect(
        await updateUserAccess(String(user._id), access, ["Design"]),
      ).toMatchObject({ ok: true });
      expect(
        await updateUserRoles(String(user._id), [{ position: "Secretary" }]),
      ).toMatchObject({ ok: true });
      expect(await User.findById(user._id).lean()).toMatchObject({
        access,
        roles: [{ position: "Secretary" }],
        managedModules:
          access === "Head" || access === "Core Team" ? ["Design"] : [],
      });
    }
    expect(await AuditLog.countDocuments()).toBe(8);
  });

  it.each(["Head", "Core Team"] as const)(
    "requires valid current modules for %s in actions and model validation",
    async (access) => {
      signIn();
      const { updateUserAccess } = await import("@/lib/actions/users");
      const user = await User.create({ name: "Member" });
      for (const modules of [[], ["Web Development"], ["Design", "unknown"]]) {
        expect(
          await updateUserAccess(
            String(user._id),
            access,
            modules as ModuleName[],
          ),
        ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
        await expect(
          new User({ access, managedModules: modules }).validate(),
        ).rejects.toThrow();
      }
      expect(await AuditLog.countDocuments()).toBe(0);
    },
  );

  it("rejects historical assignments for the current tenure and validates a tenure change atomically", async () => {
    signIn();
    const { updateUserRoles, updateUserTenure } =
      await import("@/lib/actions/users");
    const user = await User.create({ name: "Alumnus" });
    const roles = [
      { module: "Web Development" as const, position: "Head" as const },
      { position: "Operations Head" as const },
    ];
    expect(await updateUserRoles(String(user._id), roles)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    await expect(new User({ roles }).validate()).rejects.toThrow("historical");
    expect(await updateUserTenure(String(user._id), "2025-26")).toMatchObject({
      ok: true,
    });
    expect(await updateUserRoles(String(user._id), roles)).toMatchObject({
      ok: true,
    });
    expect(
      await updateUserTenure(String(user._id), CURRENT_TENURE),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Replace historical"),
      },
    });
    expect((await User.findById(user._id))?.tenure).toBe("2025-26");
    expect(await AuditLog.countDocuments()).toBe(2);
    expect(
      await updateUserRoles(String(user._id), [
        { module: "Software Development", position: "Head" },
      ]),
    ).toMatchObject({ ok: true });
    expect(
      await updateUserTenure(String(user._id), CURRENT_TENURE),
    ).toMatchObject({ ok: true });
  });

  it("rejects Core Team at user administration boundaries", async () => {
    signIn("Core Team");
    const { addUser, updateUserAccess, updateUserRoles, updateUserTenure } =
      await import("@/lib/actions/users");
    const user = await User.create({ name: "Member" });
    expect(await addUser("new@gmail.com")).toMatchObject({ ok: false });
    expect(await updateUserAccess(String(user._id), "Admin")).toMatchObject({
      ok: false,
    });
    expect(
      await updateUserRoles(String(user._id), [{ position: "Secretary" }]),
    ).toMatchObject({ ok: false });
    expect(await updateUserTenure(String(user._id), "2025-26")).toMatchObject({
      ok: false,
    });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("uses both stored and derived roles in filters and counts only visible Team people", async () => {
    await User.create([
      {
        name: "Core",
        access: "Core Team",
        managedModules: ["Design"],
        roles: [{ position: "OC" }],
        image: "/photo.png",
      },
      {
        name: "Historical",
        tenure: "2025-26",
        roles: [{ module: "Web Development", position: "Head" }],
        image: "/photo.png",
      },
      { name: "No photo", roles: [{ position: "Secretary" }], image: "  " },
      {
        name: "Coordinator",
        roles: [{ module: "Design", position: "Coordinator" }],
        image: "/photo.png",
      },
    ]);
    for (const filters of [
      { position: "OC" },
      { position: "Core Team", roleModule: "Design" },
    ]) {
      const [result] = await User.aggregate(
        userQueryPipeline(userQuerySchema.parse(filters)),
      );
      expect(result.users.map((user: { name: string }) => user.name)).toEqual([
        "Core",
      ]);
    }
    expect(await User.countDocuments(publicTeamFilter())).toBe(2);
    expect(
      (await User.find(publicTeamFilter("Web Development"))).map(
        (user) => user.name,
      ),
    ).toEqual(["Historical"]);
    expect(await User.countDocuments(publicTeamFilter("Design"))).toBe(1);
    const { searchAtlas } = await import("@/lib/atlas/search.server");
    const { parseAtlasQuery } = await import("@/lib/atlas/query");
    const all = await searchAtlas(parseAtlasQuery("type:team"), null);
    expect(all.items.map((item) => item.title).sort()).toEqual([
      "Core",
      "Historical",
    ]);
    const historical = await searchAtlas(
      parseAtlasQuery('type:team module:"Web Development"'),
      null,
    );
    expect(historical.items.map((item) => item.title)).toEqual(["Historical"]);
  });
});
