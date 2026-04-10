import { expect, test } from "@playwright/test";

test.describe("Web smoke suite", () => {
  test("redirects root to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("renders login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("renders forgot-password flow", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("renders analytics dashboard shell", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: /firm analytics/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /30 days/i })).toBeVisible();
  });

  test("renders research search UI", async ({ page }) => {
    await page.goto("/research");
    await expect(page.getByRole("heading", { name: /legal research/i })).toBeVisible();
    await expect(page.getByPlaceholder(/ask a legal question/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();
  });

  test("redirects protected dashboard route", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login$/);
  });
});
