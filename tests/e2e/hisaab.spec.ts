import { expect, test, type Page } from "@playwright/test";
import { renderReceipt } from "../../eval/lib/renderReceipt";

// Full organizer + contributor journey. Requires AI_MOCK=true and DEMO_LOGIN=true
// on the server so it is deterministic and needs no API key.

const VPA = "e2e.organizer@okicici";

async function receipt(payer: string) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  return renderReceipt({ style: "blue", status: "success", amount: 500, payeeName: "E2E Organizer", payeeVpa: VPA, payerName: payer, bank: "SBI", utr: "430511112222", when });
}

async function register(page: Page, invite: string, name: string, proof: Buffer) {
  // Each call plays a different contributor: forget the payment this browser registered.
  await page.context().clearCookies({ name: /^hisaab_paid_/ });
  await page.goto(invite);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Payment screenshot").setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: proof });
  await page.getByRole("button", { name: /register me/i }).click();
}

test("organizer finds who hasn't paid, contributor proof is verified, duplicate goes to review", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });

  await page.goto("/login");
  await page.getByRole("button", { name: /demo organizer/i }).click();
  await page.waitForURL("**/events");

  const eventName = `E2E ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Event name").fill(eventName);
  await page.getByLabel("Event date").fill("2026-11-08");
  await page.getByLabel(/Per-head/).fill("500");
  await page.getByLabel("Your UPI ID").fill(VPA);
  await page.getByLabel("Name on your UPI account").fill("E2E Organizer");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  const invite = (await page.locator("code").first().textContent())!.trim();

  await page.getByRole("link", { name: /hasn't paid/ }).click();
  await page.getByPlaceholder(/paste names/).fill("Sita Reddy\nAnil Varma\n+91 98480 12345 ~Kiran");
  await page.getByRole("button", { name: /Import & match/ }).click();
  await expect(page.getByText(/Added 3 people/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not paid yet · 3" })).toBeVisible();

  const proof = await receipt("SITA REDDY");
  await register(page, invite, "Sita Reddy", proof);
  await expect(page.getByText("Payment verified. Thank you!")).toBeVisible();
  await shot("contributor-verified");
  // Once paid: the event details and a receipt that doubles as a pass.
  await expect(page.getByRole("link", { name: "Add to Google Calendar" })).toBeVisible();
  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByText("✅ Paid")).toBeVisible();
  await expect(page.getByText(/HSB-[A-Z0-9]{8}/)).toBeVisible();

  // Same screenshot reused by someone else: must not auto-verify.
  await register(page, invite, "Kiran", proof);
  await expect(page.getByText(/organizer will confirm/)).toBeVisible();
  await expect(page.getByText(/screenshot was already used/i)).toBeVisible();

  await page.goto(invite.replace(/\/i\/.*/, "/events"));
  await page.getByRole("link", { name: eventName }).click();
  await page.getByRole("link", { name: /hasn't paid/ }).click();
  // Kiran matched the roster by name, but their payment is flagged, not verified.
  await expect(page.getByRole("heading", { name: "Not paid yet · 1" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Kiran" }).getByText("Needs review")).toBeVisible();
  await shot("roster");

  const anil = page.locator("li", { hasText: "Anil Varma" });
  await anil.getByRole("button", { name: /Write reminder/ }).click();
  await expect(anil.getByLabel("Reminder message")).toHaveValue(/₹500/);
  await shot("reminder");

  await page.getByRole("link", { name: /Payments/ }).click();
  const review = page.locator("article", { hasText: "Kiran" });
  await expect(review.getByText("✗ Screenshot not reused")).toBeVisible();
  await shot("review");
  await review.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Nothing to review")).toBeVisible();

  // Kiran registered from this browser: the invite link now shows the organizer's decision, not the form.
  await page.goto(invite);
  await expect(page.getByText(/couldn't confirm this payment/)).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.goBack();

  // A rejected payment puts the person back on the missing list.
  await page.getByRole("link", { name: /hasn't paid/ }).click();
  await expect(page.getByRole("heading", { name: "Not paid yet · 2" })).toBeVisible();

  // People have paid, so deleting is only offered once the collection is closed.
  await page.getByRole("link", { name: "Close", exact: true }).click();
  await expect(page.getByText(/close the collection before deleting it/)).toBeVisible();
  await page.getByRole("button", { name: "Close collection" }).click();
  const del = page.getByRole("button", { name: "Delete collection" });
  await expect(del).toBeDisabled();
  await page.getByLabel(/to confirm/).fill(eventName);
  await del.click();
  await page.waitForURL("**/events");
  await expect(page.getByRole("link", { name: eventName })).toHaveCount(0);
  await page.goto(invite);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
