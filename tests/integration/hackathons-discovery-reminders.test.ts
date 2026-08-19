import { NextRequest } from "next/server";
import { responseData } from "../utils/result";
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
import {
  hackathon,
  hackathonSession,
  hackathonTeam,
} from "../fixtures/hackathons";

const getSession = vi.hoisted(() => vi.fn());
const notifyMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/notify", () => ({ notifyMany }));
vi.mock("@/lib/cache", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/cache")>("@/lib/cache");
  return {
    ...actual,
    cachedFetch: vi.fn(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
        loader(),
    ),
  };
});

describe("hackathon discovery and deadline reminders", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue(hackathonSession());
  });

  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(hackathonSession());
    notifyMany.mockReset();
    vi.useRealTimers();
  });

  afterAll(stopTestMongo);

  it("lists only active hackathons ordered by latest deadline", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { GET } = await import("@/app/api/hackathons/route");
    await Hackathon.create([
      hackathon({
        name: "Later",
        deadline: new Date("2030-08-04T00:00:00.000Z"),
      }),
      hackathon({
        name: "Sooner",
        deadline: new Date("2030-08-02T00:00:00.000Z"),
      }),
      hackathon({ name: "Archived", status: "archived" }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/hackathons?page=1&limit=10"),
    );
    const body = await responseData(response);

    expect(response.status).toBe(200);
    expect(body.items.map((item: { name: string }) => item.name)).toEqual([
      "Later",
      "Sooner",
    ]);
    expect(body.pagination.total).toBe(2);
  });

  it("returns no member results for short searches", async () => {
    const { GET } = await import("@/app/api/hackathons/users/route");
    const response = await GET(
      new NextRequest("http://localhost/api/hackathons/users?q=a"),
    );
    expect(response.status).toBe(200);
    expect(await responseData(response)).toMatchObject({
      items: [],
      pagination: { total: 0 },
    });
  });

  it("treats member search metacharacters literally", async () => {
    const User = (await import("@/models/User")).default;
    const { GET } = await import("@/app/api/hackathons/users/route");
    await User.create([
      { name: "Literal [team]", email: "literal@example.test" },
      { name: "Literal t", email: "other@example.test" },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/hackathons/users?q=%5Bteam%5D&limit=10",
      ),
    );
    const body = await responseData(response);

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      name: "Literal [team]",
      email: "literal@example.test",
    });
  });

  it("reminds only unregistered users for active deadlines in the one-hour window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-08-01T10:00:00.000Z"));
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const User = (await import("@/models/User")).default;
    const { sendHackathonDeadlineReminders } =
      await import("@/lib/jobs/hackathonReminder");
    const [registered, unregistered] = await User.create([
      { name: "Registered", email: "registered@example.test" },
      { name: "Unregistered", email: "unregistered@example.test" },
    ]);
    const eligible = await Hackathon.create(
      hackathon({
        name: "Eligible",
        deadline: new Date("2030-08-03T10:30:00.000Z"),
      }),
    );
    await Hackathon.create([
      hackathon({
        name: "Too late",
        deadline: new Date("2030-08-03T11:01:00.000Z"),
      }),
      hackathon({
        name: "Archived",
        status: "archived",
        deadline: new Date("2030-08-03T10:30:00.000Z"),
      }),
    ]);
    await Team.create(
      hackathonTeam(eligible._id, {
        owner: registered._id.toString(),
        members: [registered._id.toString()],
      }),
    );

    await sendHackathonDeadlineReminders();

    expect(notifyMany).toHaveBeenCalledOnce();
    expect(notifyMany).toHaveBeenCalledWith(
      [unregistered._id.toString()],
      expect.objectContaining({
        type: "hackathon_reminder",
        message: expect.stringContaining('"Eligible"'),
      }),
    );
  });

  it("does not deliver reminders when no deadline is eligible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-08-01T10:00:00.000Z"));
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { sendHackathonDeadlineReminders } =
      await import("@/lib/jobs/hackathonReminder");
    await Hackathon.create(
      hackathon({ deadline: new Date("2030-08-04T10:00:00.000Z") }),
    );

    await sendHackathonDeadlineReminders();

    expect(notifyMany).not.toHaveBeenCalled();
  });
});
