import { expect, test } from "@playwright/test";

test("renders login form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});
