import { expect, test } from "@playwright/test";

test("organizer signs up with email and password, signs out, and signs back in", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  const password = "hisaab-e2e-pass";

  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("E2E Signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/events");
  await expect(page.getByRole("heading", { name: "Your collections" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/events");
  await expect(page.getByRole("heading", { name: "Your collections" })).toBeVisible();
});
