import { NextRequest } from "next/server";
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
import { responseData, responseError } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

const session = (access: "Member" | "Head") => ({
  user: { id: `${access.toLowerCase()}-1`, access },
  session: { id: "session-1", userId: `${access.toLowerCase()}-1` },
});

describe("contest preset routes", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue(session("Head"));
  });

  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(session("Head"));
  });

  afterAll(stopTestMongo);

  it("lists public presets while filtering archived entries by default", async () => {
    const ContestPreset = (await import("@/models/ContestPreset")).default;
    const { GET } = await import("@/app/api/contests/presets/route");
    await ContestPreset.create([
      { name: "Visible preset", archived: false },
      { name: "Archived preset", archived: true },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/contests/presets"),
    );
    const data = await responseData<any[]>(response);

    expect(response.status).toBe(200);
    expect(data.map((preset) => preset.name)).toEqual(["Visible preset"]);
  });

  it("distinguishes unauthenticated and forbidden mutations", async () => {
    const { POST } = await import("@/app/api/contests/presets/route");
    getSession.mockResolvedValueOnce(null);
    const unauthenticated = await POST(createRequest({ name: "New preset" }));
    expect(unauthenticated.status).toBe(401);
    expect(await responseError(unauthenticated)).toMatchObject({
      code: "UNAUTHENTICATED",
    });

    getSession.mockResolvedValueOnce(session("Member"));
    const forbidden = await POST(createRequest({ name: "New preset" }));
    expect(forbidden.status).toBe(403);
    expect(await responseError(forbidden)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a JSON AppResult error before opening an unauthenticated SSE stream", async () => {
    const { GET } = await import("@/app/api/contests/stream/route");
    getSession.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest("http://localhost/api/contests/stream"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await responseError(response)).toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns safe field errors for malformed JSON input", async () => {
    const { POST } = await import("@/app/api/contests/presets/route");
    const response = await POST(createRequest({ name: "x" }));
    const error = await responseError(response);

    expect(response.status).toBe(400);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { name: [expect.any(String)] },
    });
  });

  it("validates Contest sync bodies before touching Redis or queues", async () => {
    const { POST } = await import("@/app/api/contests/sync/route");
    const response = await POST(
      new NextRequest("http://localhost/api/contests/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "bad", cfHandle: "", problemId: "" }),
      }),
    );
    const error = await responseError(response);

    expect(response.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toMatchObject({
      roomId: [expect.any(String)],
      cfHandle: [expect.any(String)],
      problemId: [expect.any(String)],
    });
  });

  it("creates presets and translates duplicate names to conflicts", async () => {
    const { POST } = await import("@/app/api/contests/presets/route");
    const payload = {
      name: "Bracket standard",
      format: "bracket",
      mode: "blitz",
      durationSeconds: 300,
    };
    const created = await POST(createRequest(payload));
    expect(created.status).toBe(201);
    expect(await responseData<any>(created)).toMatchObject(payload);

    const duplicate = await POST(createRequest(payload));
    expect(duplicate.status).toBe(409);
    expect(await responseError(duplicate)).toMatchObject({ code: "CONFLICT" });
  });

  it("validates path parameters and archives an existing preset", async () => {
    const ContestPreset = (await import("@/models/ContestPreset")).default;
    const { GET, PATCH } =
      await import("@/app/api/contests/presets/[id]/route");
    const invalid = await GET(
      new NextRequest("http://localhost/api/contests/presets/not-an-id"),
      { params: Promise.resolve({ id: "not-an-id" }) },
    );
    expect(invalid.status).toBe(400);

    const preset = await ContestPreset.create({ name: "Archive me" });
    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/contests/presets/${preset._id.toString()}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ archived: true }),
        },
      ),
      { params: Promise.resolve({ id: preset._id.toString() }) },
    );

    expect(response.status).toBe(200);
    expect(await responseData<any>(response)).toMatchObject({ archived: true });
  });
});

function createRequest(body: unknown) {
  return new NextRequest("http://localhost/api/contests/presets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
