import { expect, test } from "@playwright/test";
import { renderBill } from "../../eval/lib/renderBill";

// Organizer logs expenses from bill photos; the group sees them on the invite
// page. Requires AI_MOCK=true and DEMO_LOGIN=true on the server.

test("bills fill in expenses, a re-uploaded bill is flagged, and the group sees the ledger", async ({ page, browser }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  const bill = await renderBill({
    style: "thermal",
    vendor: "Ganesh Sweets",
    items: [["Kaju katli 2kg", 2400], ["Motichoor laddu 3kg", 1800]],
    date: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }),
  });
  const upload = { name: "bill.png", mimeType: "image/png", buffer: bill };

  await page.goto("/login");
  await page.getByRole("button", { name: /demo organizer/i }).click();
  await page.waitForURL("**/events");

  const eventName = `E2E bills ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Event name").fill(eventName);
  await page.getByLabel("Event date").fill("2026-11-08");
  await page.getByLabel(/Per-head/).fill("500");
  await page.getByLabel("Your UPI ID").fill("e2e.bills@okicici");
  await page.getByLabel("Name on your UPI account").fill("E2E Organizer");
  await page.getByRole("button", { name: "Create collection" }).click();
  // The dev server compiles the event page on first visit.
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible({ timeout: 15_000 });
  const invite = (await page.locator("code").first().textContent())!.trim();

  await page.getByRole("link", { name: /Expenses/ }).click();

  // Only the photo: description, amount and category come from the bill.
  await page.getByLabel("Bill or receipt").setInputFiles(upload);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/description, amount, category read from the bill/)).toBeVisible();
  await expect(page.getByText("Worth a look")).toHaveCount(0);

  // The same bill again, typed by hand this time: flagged, not silently double-counted.
  await page.getByLabel("Bill or receipt").setInputFiles(upload);
  await page.getByLabel(/What for/).fill("Sweets for puja");
  await page.getByLabel(/Amount/).fill("4200");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Worth a look · 1" })).toBeVisible();
  const flagged = page.locator("article", { hasText: "Sweets for puja" });
  await expect(flagged.getByText("✗ Bill not logged before")).toBeVisible();
  // The organizer sees the bill itself next to the flags.
  await expect.poll(() => flagged.getByRole("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await shot("flagged-bill");
  await flagged.getByRole("button", { name: "Delete expense" }).click();
  await expect(page.getByRole("heading", { name: /Worth a look/ })).toHaveCount(0);

  // A cash expense with no bill still works the old way.
  await page.getByLabel(/What for/).fill("Diyas");
  await page.getByLabel(/Amount/).fill("300");
  await page.getByLabel("Category").selectOption("Decoration");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Expense added.")).toBeVisible();

  await page.getByRole("button", { name: "Share money update" }).click();
  await expect(page.getByLabel("Money update message")).toContainText("Collected: ₹0 from 0 people");
  await expect(page.getByLabel("Money update message")).toContainText(`${invite}#ledger`);
  await shot("expenses");

  // Contributor view: the ledger and the bill, reachable with the invite code only.
  const guest = await browser.newContext();
  const contributor = await guest.newPage();
  await contributor.goto(invite);
  const ledger = contributor.locator("#ledger");
  await expect(ledger.getByRole("heading", { name: "Where the money goes" })).toBeVisible();
  await expect(ledger.getByText("Diyas")).toBeVisible();
  await expect(ledger.getByText("No bill")).toBeVisible();
  const billLink = ledger.getByRole("link", { name: "View bill" });
  await expect(billLink).toHaveCount(1);
  await contributor.screenshot({ path: info.outputPath("contributor-ledger.png"), fullPage: true });

  const href = (await billLink.getAttribute("href"))!;
  const ok = await guest.request.get(href);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/jpeg");
  expect((await guest.request.get(href.replace(/\?c=.*/, ""))).status()).toBe(401);
  expect((await guest.request.get(href.replace(/\?c=.*/, "?c=wrongcode"))).status()).toBe(404);
  await guest.close();

  // Nobody has paid, so the collection can be deleted straight away (bills go with it).
  await page.getByRole("link", { name: "Close", exact: true }).click();
  await page.getByLabel(/to confirm/).fill(eventName);
  await page.getByRole("button", { name: "Delete collection" }).click();
  await page.waitForURL("**/events");
});
