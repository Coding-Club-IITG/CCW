import { describe, expect, it } from "vitest";

import {
  AUDIT_SUMMARY_MAX_ARRAY,
  AUDIT_SUMMARY_MAX_KEYS,
  AUDIT_SUMMARY_MAX_STRING,
  boundedSummary,
  summarizeCalendar,
  summarizeContest,
  summarizeCredits,
  summarizeFile,
  summarizeHackathon,
  summarizeNotification,
  summarizePOTD,
  summarizePublicContent,
  summarizeUser,
} from "@/lib/audit/summary";

describe("audit summaries", () => {
  it("retains only allowlisted user administration fields", () => {
    const summary = summarizeUser({
      access: "Head",
      tenure: "2026-27",
      managedModules: ["Design"],
      roles: [{ module: "Design", position: "Core Team" }],
      pizza_count: 2,
      email: "secret@example.com",
      phoneNumber: "123",
      codeforcesId: "handle",
      sessions: ["secret"],
    });
    expect(summary).toEqual({
      access: "Head",
      tenure: "2026-27",
      managedModules: ["Design"],
      roles: ["Design:Core Team"],
      pizza_count: 2,
    });
    expect(JSON.stringify(summary)).not.toMatch(/secret|example|handle|phone/i);
  });

  it("uses lengths and presence flags for sensitive content", () => {
    const content = summarizePublicContent({
      title: "Post",
      body: "private body",
      excerpt: "private excerpt",
      repoLink: "https://example.com/?token=secret",
    });
    const notification = summarizeNotification({
      target: "all",
      title: "News",
      message: "private message",
      link: "https://example.com/?token=secret",
      recipientIds: ["abc"],
    });
    expect(content).toMatchObject({
      title: "Post",
      bodyLength: 12,
      excerptLength: 15,
    });
    expect(notification).toMatchObject({
      target: "all",
      title: "News",
      hasLink: true,
    });
    expect(JSON.stringify({ content, notification })).not.toMatch(
      /private|https|token|recipientIds/,
    );
  });

  it("never includes file names, descriptions, or storage paths", () => {
    const summary = summarizeFile({
      title: "Guide",
      mimeType: "application/pdf",
      size: 50,
      originalName: "secret.pdf",
      storedFilename: "uuid.pdf",
      path: "/uploads/uuid.pdf",
      description: "hidden",
    });
    expect(summary).toEqual({
      title: "Guide",
      mimeType: "application/pdf",
      size: 50,
      accessCount: 0,
    });
  });

  it("redacts calendar, credits, hackathon, contest, and POTD payloads", () => {
    const calendar = summarizeCalendar({
      title: "Planning",
      agenda: "private agenda",
      minutes: "private minutes",
      location: "private room",
      externalUrl: "https://example.test/?secret=yes",
    });
    const credits = summarizeCredits([
      { heading: "Website", entries: [{ userId: "private-user" }] },
    ]);
    const hackathon = summarizeHackathon({
      name: "Build",
      description: "private description",
      participantCount: 4,
      websiteUrl: "https://example.test/?secret=yes",
    });
    const contest = summarizeContest({
      name: "Knockout",
      registrations: [{ cfHandle: "private_handle" }],
      submissions: [{ source: "private source" }],
    });
    const potd = summarizePOTD({
      date: "2026-08-28",
      problemId: "158A",
      handle: "private_handle",
      submissions: ["private submission"],
    });

    expect(calendar).toMatchObject({
      agendaLength: 14,
      minutesLength: 15,
      hasLocation: true,
      hasExternalUrl: true,
    });
    expect(credits).toEqual({
      headings: ["Website"],
      sectionCount: 1,
      entryCount: 1,
    });
    expect(hackathon).toMatchObject({
      name: "Build",
      descriptionLength: 19,
      participantCount: 4,
    });
    expect(contest).toMatchObject({
      name: "Knockout",
      participantCount: 1,
    });
    expect(potd).toEqual({ date: "2026-08-28", problemId: "158A" });
    expect(
      JSON.stringify({ calendar, credits, hackathon, contest, potd }),
    ).not.toMatch(/private|https|handle|submission|userId/i);
  });

  it("hard-bounds keys, strings, and arrays", () => {
    const input = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `key${index}`,
        index === 0 ? "x".repeat(500) : Array(30).fill("y"),
      ]),
    );
    const summary = boundedSummary(input, Object.keys(input));
    expect(Object.keys(summary)).toHaveLength(AUDIT_SUMMARY_MAX_KEYS);
    expect(String(summary.key0)).toHaveLength(AUDIT_SUMMARY_MAX_STRING);
    expect(summary.key1).toHaveLength(AUDIT_SUMMARY_MAX_ARRAY);
  });
});
