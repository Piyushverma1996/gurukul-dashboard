import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "99999 00001", "admin-pass-1");
  await expect(page.getByRole("heading", { name: "Hi Sharan" })).toBeVisible();
});

test("admin adds a student from a phone", async ({ page }) => {
  await page.goto("/students/new");
  await page.getByLabel("Student name").fill("Test Kid");
  await page.getByLabel("Parent name").fill("Test Parent");
  await page.getByLabel("Parent WhatsApp number").fill("98100 00099");
  await page.getByLabel("Batch").selectOption({ label: "U-12 Evening — Bal Bharati Public School" });
  await page.getByLabel(/Parent has consented/).check();
  await page.getByRole("button", { name: "Save student" }).click();
  await expect(page.getByRole("heading", { name: "Test Kid" })).toBeVisible();
  await expect(page.getByText("98100 00099")).toBeVisible();
});

test("admin adds a coach and gets shareable credentials", async ({ page }) => {
  await page.goto("/admin/coaches/new");
  await page.getByLabel("Full name").fill("E2E Coach");
  await page.getByLabel("Mobile number").fill("98100 00123");
  await page.getByRole("button", { name: "Add coach" }).click();
  await expect(page.getByText("Share these sign-in details with E2E Coach")).toBeVisible();
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", /wa\.me\/919810000123/);
});
