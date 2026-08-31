import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import CalendarEvent from "@/models/CalendarEvent";
import AuditLog from "@/models/AuditLog";
import Event from "@/models/Event";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

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
  invalidateCache: mocks.invalidateCache,
}));

function session(access: string, managedModules: unknown = []) {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      access,
      managedModules: JSON.stringify(
        (managedModules as any[]).map((item) => item.module ?? item),
      ),
    },
    session: { id: "s", userId: "u" },
  };
}

async function seedCalendar(scope: "general" | "module" = "module") {
  return CalendarEvent.create({
    title: "Design sync",
    description: "Internal",
    scope,
    module: scope === "module" ? "Design" : undefined,
    allDay: false,
    startAt: new Date("2026-08-10T09:00:00.000Z"),
    endAt: new Date("2026-08-10T10:00:00.000Z"),
    recurrenceType: "weekly",
    recurrenceCount: 2,
    location: "",
    externalUrl: "",
    agenda: "",
    minutes: "",
    remindOneDayBefore: false,
    createdBy: new mongoose.Types.ObjectId(),
  });
}

const publicInput = {
  title: "Public design sync",
  shortDescription: "Join us",
  description: "Public details",
  poster: "/api/events/assets/poster.png",
  tags: ["Design"],
};

describe("calendar publication actions", () => {
  beforeAll(startTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  afterAll(stopTestMongo);

  it("lets the module head create a linked public draft", async () => {
    const calendar = await seedCalendar();
    mocks.getSession.mockResolvedValue(session("Head", [{ module: "Design" }]));
    const { createPublicEvent } = await import("@/lib/actions/admin/events");
    const result = await createPublicEvent(
      String(calendar._id),
      publicInput,
      "draft",
    );
    expect(result.ok).toBe(true);
    const event = await Event.findOne().lean();
    expect(event).toMatchObject({
      slug: "public-design-sync",
      status: "draft",
      calendarEventId: calendar._id,
      module: "Design",
      allDay: false,
    });
    expect(
      (await CalendarEvent.findById(calendar._id).lean())?.publicEventId,
    ).toEqual(event?._id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/events/public-design-sync",
    );
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "events",
      action: "create",
      operation: "events.publication.create",
      after: {
        title: "Public design sync",
        status: "draft",
        module: "Design",
        shortDescriptionLength: 7,
        descriptionLength: 14,
      },
    });
    expect(JSON.stringify(audit)).not.toContain("Public details");
    expect(JSON.stringify(audit)).not.toContain("poster.png");
  });

  it("prevents a head from publishing another module", async () => {
    const calendar = await seedCalendar();
    mocks.getSession.mockResolvedValue(
      session("Head", [{ module: "Cybersecurity" }]),
    );
    const { createPublicEvent } = await import("@/lib/actions/admin/events");
    await expect(
      createPublicEvent(String(calendar._id), publicInput, "published"),
    ).resolves.toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("publishes and returns a linked event to draft", async () => {
    const calendar = await seedCalendar("general");
    mocks.getSession.mockResolvedValue(session("Admin"));
    const { createPublicEvent, setPublicEventStatus } =
      await import("@/lib/actions/admin/events");
    const created = await createPublicEvent(
      String(calendar._id),
      publicInput,
      "draft",
    );
    if (!created.ok) throw new Error(created.error.message);
    await expect(
      setPublicEventStatus(String(created.data._id), "published"),
    ).resolves.toMatchObject({ ok: true });
    expect(await Event.findById(created.data._id).lean()).toMatchObject({
      status: "published",
      publishedAt: expect.any(Date),
    });
    await setPublicEventStatus(String(created.data._id), "draft");
    expect(await Event.findById(created.data._id).lean()).toMatchObject({
      status: "draft",
    });
    expect(
      (await AuditLog.find().sort({ _id: 1 }).lean()).map((event) => [
        event.action,
        event.operation,
      ]),
    ).toEqual([
      ["create", "events.publication.create"],
      ["publish", "events.status.update"],
      ["status_change", "events.status.update"],
    ]);
  });

  it("stores an optional public audience and audits it", async () => {
    const calendar = await seedCalendar();
    mocks.getSession.mockResolvedValue(session("Head", [{ module: "Design" }]));
    const { createPublicEvent } = await import("@/lib/actions/admin/events");

    const result = await createPublicEvent(
      String(calendar._id),
      { ...publicInput, publicAudience: "First years" },
      "published",
    );
    expect(result.ok).toBe(true);
    expect((await Event.findOne().lean())?.publicAudience).toBe("First years");

    const audit = await AuditLog.findOne().lean();
    expect(audit?.after).toMatchObject({ publicAudience: "First years" });
  });

  it("defaults the public audience to empty when omitted", async () => {
    const calendar = await seedCalendar();
    mocks.getSession.mockResolvedValue(session("Head", [{ module: "Design" }]));
    const { createPublicEvent } = await import("@/lib/actions/admin/events");

    await createPublicEvent(String(calendar._id), publicInput, "draft");
    expect((await Event.findOne().lean())?.publicAudience).toBe("");
  });

  it("rejects an over-long public audience", async () => {
    const calendar = await seedCalendar();
    mocks.getSession.mockResolvedValue(session("Head", [{ module: "Design" }]));
    const { createPublicEvent } = await import("@/lib/actions/admin/events");

    const result = await createPublicEvent(
      String(calendar._id),
      { ...publicInput, publicAudience: "x".repeat(81) },
      "draft",
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Open to must be 80 characters or fewer.",
      },
    });
    expect(await Event.countDocuments()).toBe(0);
  });
});
