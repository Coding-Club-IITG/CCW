import { expect, test } from "@playwright/test";

test("public home page exposes its primary navigation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Coding Club IITG" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore Projects" }),
  ).toHaveAttribute("href", "/projects");
});
