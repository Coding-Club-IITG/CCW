import { NextRequest } from "next/server";
import { responseData, responseError } from "../utils/result";
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
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { hackathon } from "../fixtures/hackathons";

const getSession = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());
const notifyMany = vi.hoisted(() => vi.fn());
const fetchOgImage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/cache", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/cache")>("@/lib/cache");
  return {
    ...actual,
    cachedFetch: vi.fn(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
        loader(),
    ),
    invalidateCache,
  };
});
vi.mock("@/lib/notify", () => ({ notifyMany }));
vi.mock("@/lib/ogImage", () => ({ fetchOgImage }));

describe("admin hackathon routes", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue({
      user: { id: "admin-1", access: "Head" },
    });
    fetchOgImage.mockResolvedValue("https://example.test/cover.png");
  });

  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue({
      user: { id: "admin-1", access: "Head" },
    });
    invalidateCache.mockReset();
    notifyMany.mockReset();
  });

  afterAll(stopTestMongo);

  it("distinguishes unauthenticated and non-admin access", async () => {
    const { GET } = await import("@/app/api/admin/hackathons/route");
    getSession.mockResolvedValueOnce(null);
    expect((await GET(request("/api/admin/hackathons"))).status).toBe(401);
    getSession.mockResolvedValueOnce({
      user: { id: "member-1", access: "Member" },
    });
    expect((await GET(request("/api/admin/hackathons"))).status).toBe(403);
  });

  it("filters and paginates archived hackathons", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { GET } = await import("@/app/api/admin/hackathons/route");
    await Hackathon.create([
      hackathon({ name: "Active", status: "active" }),
      hackathon({ name: "Archived", status: "archived" }),
    ]);
    const response = await GET(
      request("/api/admin/hackathons?status=archived&page=1&limit=1"),
    );
    const body = await responseData(response);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Archived");
    expect(body.pagination.total).toBe(1);
  });

  it.each([
    [{ organization: "" }, "Organization is required."],
    [{ maxMembers: 0 }, "Max members must be at least 1."],
    [{ minMembers: 4 }, "Min members cannot exceed max members."],
    [{ deadline: "not-a-date" }, "Invalid deadline date."],
  ])("rejects invalid creation input", async (override, error) => {
    const { POST } = await import("@/app/api/admin/hackathons/route");
    const response = await POST(
      jsonRequest("/api/admin/hackathons", "POST", {
        ...creationBody(),
        ...override,
      }),
    );
    expect(response.status).toBe(400);
    expect(await responseError(response)).toMatchObject({ message: error });
  });

  it("creates a normalized hackathon and broadcasts it", async () => {
    const User = (await import("@/models/User")).default;
    const { POST } = await import("@/app/api/admin/hackathons/route");
    const users = await User.create([
      { name: "One", email: "one@example.test" },
      { name: "Two", email: "two@example.test" },
    ]);
    const response = await POST(
      jsonRequest("/api/admin/hackathons", "POST", creationBody()),
    );
    const body = await responseData(response);
    expect(response.status).toBe(201);
    expect(body.hackathon).toMatchObject({
      name: "Build Sprint",
      minMembers: 1,
      skills: ["TypeScript", "Design"],
      ogImage: "https://example.test/cover.png",
      status: "active",
    });
    expect(invalidateCache).toHaveBeenCalledWith("hackathons");
    expect(invalidateCache).toHaveBeenCalledWith("admin:hackathons");
    expect(notifyMany).toHaveBeenCalledWith(
      expect.arrayContaining(
        users.map((user: { _id: { toString(): string } }) =>
          user._id.toString(),
        ),
      ),
      expect.objectContaining({ title: "New Hackathon Added" }),
    );
    expect(notifyMany.mock.calls[0][0]).toHaveLength(2);
  });

  it("validates cross-field size updates", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { PATCH } = await import("@/app/api/admin/hackathons/[id]/route");
    const saved = await Hackathon.create(hackathon());
    const response = await PATCH(
      jsonRequest(`/api/admin/hackathons/${saved._id}`, "PATCH", {
        minMembers: 4,
      }),
      context(saved._id.toString()),
    );
    expect(response.status).toBe(400);
  });

  it("updates whitelisted fields and archives without deleting", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { PATCH, DELETE } =
      await import("@/app/api/admin/hackathons/[id]/route");
    const saved = await Hackathon.create(hackathon());
    const updated = await PATCH(
      jsonRequest(`/api/admin/hackathons/${saved._id}`, "PATCH", {
        name: " Updated Sprint ",
        createdBy: "attacker",
      }),
      context(saved._id.toString()),
    );
    expect(updated.status).toBe(200);
    expect((await responseData(updated)).hackathon.name).toBe("Updated Sprint");
    expect((await Hackathon.findById(saved._id).lean())?.createdBy).toBe(
      "admin-1",
    );

    const archived = await DELETE(
      request(`/api/admin/hackathons/${saved._id}`, "DELETE"),
      context(saved._id.toString()),
    );
    expect(archived.status).toBe(200);
    expect((await Hackathon.findById(saved._id).lean())?.status).toBe(
      "archived",
    );
  });
});

function creationBody() {
  return {
    name: " Build Sprint ",
    organization: " Coding Club ",
    minMembers: 1,
    maxMembers: 3,
    skills: [" TypeScript ", "", "Design"],
    websiteUrl: "https://example.test/hackathon",
    deadline: "2030-08-03T00:00:00.000Z",
    description: " Build something ",
  };
}

function request(path: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, { method });
}
function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
