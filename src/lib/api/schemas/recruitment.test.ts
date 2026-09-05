import { describe, expect, it } from "vitest";

import { MAX_RECRUITMENT_PDF_BYTES, MODULES } from "@/lib/constants";

import { patchRecruitmentSchema, recruitmentPdfSchema } from "./recruitment";

describe("recruitment scheduling inputs", () => {
  it("distinguishes omitted fields from explicit null", () => {
    expect(
      patchRecruitmentSchema.parse({
        modules: [{ module: MODULES[0], resourcesReleaseAt: null }],
      }),
    ).toEqual({ modules: [{ module: MODULES[0], resourcesReleaseAt: null }] });
    expect(patchRecruitmentSchema.parse({})).toEqual({});
  });

  it.each(["", "tomorrow", "2026-12-01T10:00", 0])(
    "rejects ambiguous dates: %s",
    (value) => {
      expect(
        patchRecruitmentSchema.safeParse({
          modules: [{ module: MODULES[0], taskReleaseAt: value }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects unknown fields and duplicate module patches", () => {
    expect(
      patchRecruitmentSchema.safeParse({
        modules: [{ module: MODULES[0], storedName: "other.pdf" }],
      }).success,
    ).toBe(false);
    expect(
      patchRecruitmentSchema.safeParse({
        modules: [{ module: MODULES[0] }, { module: MODULES[0] }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["0026-09-01T06:30:00.000Z", false],
    ["1999-12-31T18:29:59.999Z", false],
    ["1999-12-31T18:30:00.000Z", true],
    ["2200-12-31T18:29:59.999Z", true],
    ["2200-12-31T18:30:00.000Z", false],
  ])("bounds scheduling dates in IST: %s", (value, accepted) => {
    expect(
      patchRecruitmentSchema.safeParse({
        modules: [{ module: MODULES[0], taskReleaseAt: value }],
      }).success,
    ).toBe(accepted);
  });
});

describe("recruitment PDF inputs", () => {
  it("accepts a PDF at the size limit", () => {
    const file = new File(
      [new Uint8Array(MAX_RECRUITMENT_PDF_BYTES)],
      "Resources.pdf",
      { type: "application/pdf" },
    );
    expect(recruitmentPdfSchema.safeParse(file).success).toBe(true);
  });

  it.each([
    ["empty", 0, "application/pdf", "Resources.pdf"],
    ["oversized", MAX_RECRUITMENT_PDF_BYTES + 1, "application/pdf", "Task.pdf"],
    ["wrong MIME type", 5, "text/plain", "Resources.pdf"],
    ["long filename", 5, "application/pdf", "x".repeat(256)],
  ] as const)("rejects a PDF with %s metadata", (_case, size, type, name) => {
    const file = new File([new Uint8Array(size)], name, {
      type,
    });
    expect(recruitmentPdfSchema.safeParse(file).success).toBe(false);
  });
});
