import { expect, test, type Page } from "@playwright/test";
import { renderReceipt } from "../../eval/lib/renderReceipt";

// A society fund that collects every month. Requires AI_MOCK=true and DEMO_LOGIN=true.

const VPA = "e2e.fund@okicici";

async function inviteCode(page: Page): Promise<string> {
  await page.getByRole("link", { name: "Overview" }).click();
  const link = (await page.locator("code").first().textContent())!.trim();
  return link;
}

test("a monthly fund carries its members over and shows who keeps missing months", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /demo organizer/i }).click();
  await page.waitForURL("**/events");

  // January, so every month in this test is already over whenever it runs.
  const fundName = `Fund ${test.info().project.name} ${Date.now()}`;
  await page.getByLabel("Event name").fill(fundName);
  await page.getByLabel("Event date").fill("2026-01-10");
  await page.getByLabel(/Per-head/).fill("500");
  await page.getByLabel("Your UPI ID").fill(VPA);
  await page.getByLabel("Name on your UPI account").fill("E2E Organizer");
  await page.getByLabel(/Repeats every month/).check();
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByRole("heading", { name: `${fundName} · Jan 2026` })).toBeVisible({ timeout: 15_000 });
  const january = page.url();

  await page.getByRole("link", { name: /hasn't paid/ }).click();
  await page.getByPlaceholder(/paste names/).fill("Sita Reddy\nAnil Varma\n+91 98480 12345 ~Kiran\nGanesh Sweets Shop");
  await page.getByRole("button", { name: /Import & match/ }).click();
  await expect(page.getByText(/Added 4 people/)).toBeVisible();

  // Sita pays January on the invite link.
  const invite = await inviteCode(page);
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const proof = await renderReceipt({ style: "blue", status: "success", amount: 500, payeeName: "E2E Organizer", payeeVpa: VPA, payerName: "SITA REDDY", bank: "SBI", utr: "430519990001", when });
  await page.goto(invite);
  await page.getByLabel("Your name").fill("Sita Reddy");
  await page.getByLabel("Payment screenshot").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: proof });
  await page.getByRole("button", { name: /register me/i }).click();
  await expect(page.getByText("Payment verified. Thank you!")).toBeVisible();

  // February and March start with the same people, all unpaid; the shop stays excluded.
  await page.goto(january);
  await page.getByRole("button", { name: "Start next month" }).click();
  await expect(page.getByRole("heading", { name: `${fundName} · Feb 2026` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Not paid yet · 3" })).toBeVisible();
  await page.getByRole("button", { name: "Start next month" }).click();
  await expect(page.getByRole("heading", { name: `${fundName} · Mar 2026` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Not paid yet · 3" })).toBeVisible();
  await expect(page.getByText("also missed Jan, Feb").first()).toBeVisible();
  await expect(page.getByText("also missed Feb", { exact: true })).toBeVisible(); // Sita paid January
  const marchInvite = await inviteCode(page);

  // The fund page: everyone month by month.
  await page.getByRole("link", { name: /all months/ }).click();
  await expect(page.getByRole("heading", { name: fundName, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missed 2 or more months in a row · 3" })).toBeVisible();
  const sita = page.getByRole("row", { name: /Sita Reddy/ });
  await expect(sita.getByLabel("Paid", { exact: true })).toHaveCount(1);
  await expect(sita.getByLabel("Not paid", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("row", { name: /Ganesh Sweets/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("fund.png"), fullPage: true });

  // The collections list shows the fund once.
  await page.goto("/events");
  await expect(page.getByRole("link", { name: new RegExp(fundName) })).toHaveCount(1);
  await expect(page.getByRole("link", { name: new RegExp(fundName) })).toContainText("Monthly");

  // March's invite link shows the whole fund's money, including January's payment.
  await page.goto(marchInvite);
  await expect(page.getByText(/All months together/)).toBeVisible();
  await expect(page.locator("#ledger")).toContainText("₹500");

  // January's screenshot doesn't pay for March: it goes to the organizer instead.
  await page.getByLabel("Your name").fill("Sita Reddy");
  await page.getByLabel("Payment screenshot").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: proof });
  await page.getByRole("button", { name: /register me/i }).click();
  await expect(page.getByText("Registered! The organizer will confirm your payment.")).toBeVisible();
  await expect(page.getByText(/this screenshot was already used for another registration/)).toBeVisible();
});
