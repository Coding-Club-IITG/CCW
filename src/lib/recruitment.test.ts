import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { MAX_RECRUITMENT_SCHEDULE_TICKS } from "@/lib/constants";
import Recruitment from "@/models/Recruitment";
import { emptyRecruitmentModules } from "../../tests/fixtures/recruitment";

import {
  buildRecruitmentSchedule,
  isDocumentReleased,
  publicRecruitment,
  recruitmentStatus,
  serializeRecruitment,
} from "./recruitment";

const now = new Date("2026-12-01T06:30:00.000Z");
const past = "2026-11-01T06:30:00.000Z";
const future = "2026-12-02T06:30:00.000Z";
const file = {
  _id: new Types.ObjectId(),
  storedName: "private-name.pdf",
  originalName: "Resources.pdf",
  mimeType: "application/pdf" as const,
  size: 100,
};

describe("recruitment release boundary", () => {
  it.each([
    ["draft", past, file, false],
    ["published", null, file, false],
    ["published", future, file, false],
    ["published", now.toISOString(), file, true],
    ["published", past, file, true],
    ["published", past, null, false],
    ["published", "invalid", file, false],
  ] as const)(
    "handles status=%s date=%s",
    (status, releaseAt, document, expected) => {
      expect(isDocumentReleased({ status }, { releaseAt, document }, now)).toBe(
        expected,
      );
    },
  );

  it("accepts Mongo dates as well as serialized timestamps", () => {
    expect(
      isDocumentReleased(
        { status: "published" },
        { releaseAt: new Date(past), document: file },
        now,
      ),
    ).toBe(true);
    expect(
      isDocumentReleased(
        { status: "published" },
        { releaseAt: new Date("invalid"), document: file },
        now,
      ),
    ).toBe(false);
  });

  it("withholds unreleased metadata while preserving announced dates", async () => {
    const edition = new Recruitment({
      year: 2026,
      season: "Winter",
      status: "published",
      createdBy: new Types.ObjectId(),
    });
    edition.modules[0].resources = {
      document: file,
      releaseAt: new Date(future),
    };
    await edition.validate();
    const serialized = serializeRecruitment(edition);
    const publicData = publicRecruitment(serialized, now);
    expect(publicData.modules[0].resources).toEqual({
      document: null,
      releaseAt: future,
    });
    expect(JSON.stringify(publicData)).not.toContain(String(file._id));
    expect(JSON.stringify(publicData)).not.toContain(file.originalName);
    expect(serialized.modules[0].resources.document?._id).toBe(
      String(file._id),
    );
    expect(JSON.stringify(serialized)).not.toContain(file.storedName);
    expect(
      publicRecruitment(serialized, new Date(future)).modules[0].resources
        .document?._id,
    ).toBe(String(file._id));
  });
});

describe("optional scheduling and edition defaults", () => {
  it("seeds five unique modules and permits publishing a completely empty edition", async () => {
    const edition = new Recruitment({
      year: 2026,
      season: "Winter",
      status: "published",
      createdBy: new Types.ObjectId(),
    });
    await edition.validate();
    expect(edition.slug).toBe("2026-winter");
    expect(edition.label).toBe("2026 Winter");
    expect(serializeRecruitment(edition).modules).toEqual(
      emptyRecruitmentModules(),
    );
  });
  it("rejects duplicate/missing modules", async () => {
    const edition = new Recruitment({
      year: 2026,
      season: "Summer",
      createdBy: new Types.ObjectId(),
    });
    edition.modules[1].module = edition.modules[0].module;
    await expect(edition.validate()).rejects.toThrow();
  });
});

describe("recruitment schedule math", () => {
  it("omits a schedule with no dates", () => {
    expect(buildRecruitmentSchedule(emptyRecruitmentModules())).toBeNull();
  });
  it("renders all five lanes when only a date without a PDF is set", () => {
    const modules = emptyRecruitmentModules();
    modules[1].resources.releaseAt = past;
    const schedule = buildRecruitmentSchedule(modules)!;
    expect(schedule.lanes).toHaveLength(5);
    expect(schedule.lanes[0].bar).toBeNull();
    expect(schedule.lanes[1].bar).toEqual({ left: 50, width: 0 });
    expect(schedule.start).toBe(Date.parse(past) - 2 * 86400000);
    expect(schedule.end).toBe(Date.parse(past) + 2 * 86400000);
  });
  it("handles deadline-only lanes and out-of-order dates without negative bars", () => {
    const modules = emptyRecruitmentModules();
    modules[0].submissionDeadline = past;
    modules[1].resources.releaseAt = future;
    modules[1].task.releaseAt = past;
    const schedule = buildRecruitmentSchedule(modules)!;
    expect(schedule.lanes[0].marks[0].kind).toBe("deadline");
    expect(schedule.lanes[1].marks.map((mark) => mark.kind)).toEqual([
      "task",
      "resources",
    ]);
    expect(schedule.lanes[1].bar!.width).toBeGreaterThan(0);
    expect(schedule.lanes[1].marks[1].flip).toBe(true);
  });
  it("uses a third baseline when all three markers coincide", () => {
    const modules = emptyRecruitmentModules();
    modules[0].resources.releaseAt = past;
    modules[0].task.releaseAt = past;
    modules[0].submissionDeadline = past;
    const lane = buildRecruitmentSchedule(modules)!.lanes[0];
    expect(lane.marks.map((mark) => mark.row)).toEqual([0, 1, 2]);
    expect(lane.rows).toBe(3);
  });
  it("snaps weekly ticks to Mondays at midnight IST across year boundaries", () => {
    const modules = emptyRecruitmentModules();
    modules[0].resources.releaseAt = "2026-12-28T12:00:00+05:30";
    modules[0].submissionDeadline = "2027-01-11T18:00:00+05:30";
    const schedule = buildRecruitmentSchedule(modules)!;
    expect(schedule.ticks.length).toBeGreaterThan(1);
    for (const tick of schedule.ticks) {
      const ist = new Date(tick.at + 330 * 60000);
      expect(ist.getUTCDay()).toBe(1);
      expect(ist.getUTCHours()).toBe(0);
      expect(ist.getUTCMinutes()).toBe(0);
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(100);
    }
  });
  it("ignores malformed dates", () => {
    const modules = emptyRecruitmentModules();
    modules[0].task.releaseAt = "invalid";
    expect(buildRecruitmentSchedule(modules)).toBeNull();
  });
  it("bounds tick rendering even for an old record with a mistyped year", () => {
    const modules = emptyRecruitmentModules();
    modules[0].resources.releaseAt = "0026-09-01T06:30:00.000Z";
    modules[0].submissionDeadline = "2026-09-24T18:29:00.000Z";
    const schedule = buildRecruitmentSchedule(modules)!;
    expect(schedule.ticks.length).toBeGreaterThan(1);
    expect(schedule.ticks.length).toBeLessThanOrEqual(
      MAX_RECRUITMENT_SCHEDULE_TICKS,
    );
    expect(schedule.lanes[0].marks).toHaveLength(2);
    expect(schedule.ticks.at(-1)!.position).toBeGreaterThan(80);
  });
});

it("derives rollout status and leaves released PDFs available after closure", () => {
  const entry = emptyRecruitmentModules()[0];
  expect(recruitmentStatus(entry, now)).toBe("To be announced");
  entry.resources.document = { ...file, _id: String(file._id) };
  expect(recruitmentStatus(entry, now)).toBe("Resources out");
  entry.task.document = { ...file, _id: String(file._id) };
  expect(recruitmentStatus(entry, now)).toBe("Task out");
  entry.submissionDeadline = future;
  expect(recruitmentStatus(entry, now)).toBe("Closes within 24 hours");
  expect(recruitmentStatus(entry, new Date(future))).toBe("Closed");
  expect(
    isDocumentReleased(
      { status: "published" },
      { ...entry.task, releaseAt: past },
      new Date(future),
    ),
  ).toBe(true);
});
