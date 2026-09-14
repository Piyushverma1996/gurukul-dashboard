import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("pages are private and not indexable", async ({ page, request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong password is rejected", async ({ page }) => {
  await login(page, "99999 00002", "not-the-password");
  // Next.js also renders an (empty) role="alert" route announcer, so match our message by text.
  await expect(page.getByRole("alert").filter({ hasText: "Wrong phone number or password" })).toBeVisible();
});

test("an assistant must replace the temporary password on first login", async ({ page }) => {
  await login(page, "99999 00003", "assist-pass-1");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Temporary password").fill("assist-pass-1");
  await page.getByLabel("New password", { exact: true }).fill("assist-new-123");
  await page.getByLabel("Confirm new password").fill("assist-new-123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Hi Aman" })).toBeVisible();
});

test("a head coach sees only their own batch and cannot reach admin pages", async ({ page }) => {
  await login(page, "99999 00002", "coach-pass-1");
  await expect(page.getByRole("heading", { name: "Hi Ravi" })).toBeVisible();
  await expect(page.getByText("U-12 Evening").first()).toBeVisible();
  await page.getByRole("link", { name: "My students" }).first().click();
  await expect(page.getByText("Arjun Mehta")).toBeVisible();
  await expect(page.getByText("Dhruv Malhotra")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add student" })).toHaveCount(0);
  const res = await page.goto("/admin/centers");
  expect(res?.status()).toBe(404);
});
