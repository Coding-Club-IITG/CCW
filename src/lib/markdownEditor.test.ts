import { describe, expect, it } from "vitest";
import {
  deriveUploadedImageAltText,
  replaceSelectionWithMarkdown,
} from "./markdownEditor";

describe("deriveUploadedImageAltText", () => {
  it("normalizes the original filename", () => {
    expect(deriveUploadedImageAltText("system-architecture_diagram.png")).toBe(
      "system architecture diagram",
    );
    expect(deriveUploadedImageAltText("  launch---flow__final .webp")).toBe(
      "launch flow final",
    );
  });

  it("uses a fallback for an empty normalized name", () => {
    expect(deriveUploadedImageAltText(".png")).toBe("Uploaded image");
    expect(deriveUploadedImageAltText("---___.jpg")).toBe("Uploaded image");
  });
});

describe("replaceSelectionWithMarkdown", () => {
  it("replaces exactly the captured range and returns the new caret", () => {
    expect(
      replaceSelectionWithMarkdown(
        "before selected after",
        7,
        15,
        "![diagram](/image.png)",
      ),
    ).toEqual({
      value: "before ![diagram](/image.png) after",
      caret: 29,
    });
  });
});
