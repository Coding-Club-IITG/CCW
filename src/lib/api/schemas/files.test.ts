import { describe, expect, it } from "vitest";

import { createFileUploadSchema } from "./files";

describe("file upload validation", () => {
  it("uses the configured byte limit inclusively", () => {
    const schema = createFileUploadSchema(1024);
    expect(
      schema.safeParse(new File([new Uint8Array(1024)], "at-limit.bin"))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(new File([new Uint8Array(1025)], "over-limit.bin"))
        .success,
    ).toBe(false);
    expect(
      createFileUploadSchema(2048).safeParse(
        new File([new Uint8Array(1025)], "allowed.bin"),
      ).success,
    ).toBe(true);
  });

  it.each([null, "not a file", new File([], "empty.bin")])(
    "rejects missing or empty files",
    (value) => {
      expect(createFileUploadSchema(1024).safeParse(value).success).toBe(false);
    },
  );
});
