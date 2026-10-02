import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicAnalyticsPage } from "@/lib/telemetry/publicPage";

describe("public analytics page coverage", () => {
  it("covers every public page in the App Router", () => {
    const pages = readdirSync("src/app/(public)", {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith("page.tsx"))
      .map(
        (file) =>
          `/${file.replace(/\/?page\.tsx$/, "").replace("[slug]", "example-post")}`,
      );
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages)
      expect(isPublicAnalyticsPage(page), page).toBe(true);
  });
});
