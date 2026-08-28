import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import AuditLog from "@/models/AuditLog";
import Project from "@/models/Project";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { responseData } from "../utils/result";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache")>()),
  cachedFetch: vi.fn(
    async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
      loader(),
  ),
  invalidateCache: mocks.invalidateCache,
}));

function projectForm(overrides: Record<string, string> = {}) {
  const values = {
    title: "Club website",
    description: "The Coding Club website",
    repoLink: "https://github.com/Coding-Club-IITG/website",
    liveUrl: "",
    date: "2026-08",
    module: "Software Development",
    status: "Ongoing",
    tags: "Next.js, TypeScript",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("admin project workflows", () => {
  beforeAll(startTestMongo);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin", access: "Head" },
      session: { id: "session", userId: "admin" },
    });
  });
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("creates, edits, loads, and clears an optional live URL", async () => {
    const { createProject, deleteProject, updateProject } =
      await import("@/lib/actions/admin/projects");
    const collectionRoute = await import("@/app/api/admin/projects/route");
    const itemRoute = await import("@/app/api/admin/projects/[id]/route");

    const created = await createProject(
      projectForm({ liveUrl: "https://codingclub.in" }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const storedProject = await Project.findOne().lean();
    expect(storedProject).not.toBeNull();
    const projectId = String(storedProject?._id);
    expect(created.data.project).toMatchObject({
      liveUrl: "https://codingclub.in",
      tags: ["Next.js", "TypeScript"],
    });

    const updated = await updateProject(
      projectId,
      projectForm({ liveUrl: "https://projects.codingclub.in" }),
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.data.project).toMatchObject({
        liveUrl: "https://projects.codingclub.in",
      });
    }

    const listResponse = await collectionRoute.GET(
      new NextRequest("http://localhost/api/admin/projects"),
    );
    const list = await responseData<{ items: Array<{ liveUrl?: string }> }>(
      listResponse,
    );
    expect(list.items[0]?.liveUrl).toBe("https://projects.codingclub.in");

    const itemResponse = await itemRoute.GET(
      new NextRequest(`http://localhost/api/admin/projects/${projectId}`),
      { params: Promise.resolve({ id: projectId }) },
    );
    const loaded = await responseData<{
      project: { liveUrl?: string };
    }>(itemResponse);
    expect(loaded.project.liveUrl).toBe("https://projects.codingclub.in");

    const cleared = await updateProject(
      projectId,
      projectForm({ liveUrl: "  " }),
    );
    expect(cleared.ok).toBe(true);
    expect((await Project.findById(projectId).lean())?.liveUrl).toBeUndefined();

    await expect(deleteProject(projectId)).resolves.toMatchObject({ ok: true });
    expect(await Project.findById(projectId)).toBeNull();
    expect(
      (await AuditLog.find().sort({ _id: 1 }).lean()).map(
        (event) => event.operation,
      ),
    ).toEqual([
      "projects.create",
      "projects.update",
      "projects.update",
      "projects.delete",
    ]);
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain(
      "github.com",
    );
  });

  it.each([
    [
      { repoLink: "not a URL" },
      "Repository link must be a valid HTTP or HTTPS URL.",
    ],
    [
      { repoLink: "ftp://github.com/example/project" },
      "Repository link must be a valid HTTP or HTTPS URL.",
    ],
    [
      { liveUrl: "not a URL" },
      "Live site URL must be a valid HTTP or HTTPS URL.",
    ],
    [
      { liveUrl: "javascript:alert(1)" },
      "Live site URL must be a valid HTTP or HTTPS URL.",
    ],
  ])("rejects invalid project links", async (overrides, message) => {
    const { createProject } = await import("@/lib/actions/admin/projects");

    await expect(createProject(projectForm(overrides))).resolves.toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message },
    });
    expect(await Project.countDocuments()).toBe(0);
  });
});
