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

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: "Design sync",
    description: "Internal weekly sync",
    scope: "module",
    module: "Design",
    allDay: false,
    startDate: "2026-08-10",
    startTime: "14:30",
    endDate: "2026-08-10",
    endTime: "15:30",
    recurrenceType: "none",
    recurrenceCount: 1,
    location: "Conference room",
    externalUrl: "",
    agenda: "Review work",
    minutes: "",
    remindOneDayBefore: true,
    ...overrides,
  };
}

function session(role: string, moduleRoles: unknown = []) {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      role,
      moduleRoles: JSON.stringify(moduleRoles),
    },
    session: { id: "session", userId: "user" },
  };
}

describe("calendar actions", () => {
  beforeAll(startTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  afterAll(stopTestMongo);

  it("allows a module head to create an event for their module", async () => {
    mocks.getSession.mockResolvedValue(session("Head", [{ module: "Design" }]));
    const { createCalendarEvent } = await import("@/lib/actions/calendar");

    const result = await createCalendarEvent(input());

    expect(result.success).toBe(true);
    expect(await CalendarEvent.findOne().lean()).toMatchObject({
      title: "Design sync",
      scope: "module",
      module: "Design",
      remindOneDayBefore: true,
    });
  });

  it("prevents a global administrator from creating a module event", async () => {
    mocks.getSession.mockResolvedValue(session("Secretary"));
    const { createCalendarEvent } = await import("@/lib/actions/calendar");

    await expect(createCalendarEvent(input())).resolves.toEqual({
      success: false,
      error: "You cannot manage events in that scope.",
    });
    expect(await CalendarEvent.countDocuments()).toBe(0);
  });

  it("allows every signed-in member to list all scopes", async () => {
    const creator = new mongoose.Types.ObjectId();
    await CalendarEvent.create([
      {
        ...calendarRecord(creator),
        title: "General",
        scope: "general",
      },
      {
        ...calendarRecord(creator),
        title: "Module",
        scope: "module",
        module: "Design",
      },
    ]);
    mocks.getSession.mockResolvedValue(session("Member"));
    const { listCalendarEvents } = await import("@/lib/actions/calendar");

    const result = await listCalendarEvents(
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(2);
  });

  it("cascade-deletes the linked public event", async () => {
    const creator = new mongoose.Types.ObjectId();
    const calendarEvent = await CalendarEvent.create({
      ...calendarRecord(creator),
      title: "General",
      scope: "general",
    });
    const publicEvent = await Event.create({
      title: "Public",
      description: "Details",
      poster: "/poster.png",
      startDate: calendarEvent.startAt,
      tags: [],
      recurrenceType: "none",
      recurrenceCount: 1,
      status: "published",
      publishedAt: new Date(),
      calendarEventId: calendarEvent._id,
      scheduleFingerprint: "fingerprint",
    });
    calendarEvent.publicEventId = publicEvent._id;
    await calendarEvent.save();
    mocks.getSession.mockResolvedValue(session("Secretary"));
    const { deleteCalendarEvent } = await import("@/lib/actions/calendar");

    await expect(
      deleteCalendarEvent(String(calendarEvent._id)),
    ).resolves.toEqual({
      success: true,
    });
    expect(await CalendarEvent.countDocuments()).toBe(0);
    expect(await Event.countDocuments()).toBe(0);
  });
});

function calendarRecord(createdBy: mongoose.Types.ObjectId) {
  return {
    description: "Details",
    allDay: false,
    startAt: new Date("2026-08-10T09:00:00.000Z"),
    endAt: new Date("2026-08-10T10:00:00.000Z"),
    recurrenceType: "none",
    recurrenceCount: 1,
    location: "",
    externalUrl: "",
    agenda: "",
    minutes: "",
    remindOneDayBefore: false,
    createdBy,
  };
}
