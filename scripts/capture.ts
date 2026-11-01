// Captures README screenshots and a narrated demo video of the running app.
//
//   npm run db:seed && npm run capture -- shots   -> docs/screenshots/*.png
//   npm run db:seed && npm run capture -- video   -> docs/demo/hisaab-demo.mp4
//
// Needs the app on APP_URL (default http://localhost:3000) with AI_MOCK=true and
// DEMO_LOGIN=true, freshly seeded. The video run registers two payments and rejects
// one, so re-seed afterwards to get the demo data back. ffmpeg must be on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, devices, type BrowserContext, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { renderReceipt } from "../eval/lib/renderReceipt";
import { paymentCookieName, signContributionId } from "../src/lib/contributionToken";

// Only used to look up seeded contributions for the contributor screenshots.
const prisma = new PrismaClient();

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "docs", "screenshots");
const DEMO = path.join(ROOT, "docs", "demo");
const W = 1280;
const H = 800;
const EVENT = "Diwali 2026 – Tower B";
const INVITE = `${BASE}/i/diwali26`;

// Hides the Next.js dev-mode badge so it doesn't show up in captures.
const HIDE_DEV_BADGE = `document.addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.head.appendChild(s);
});`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Lazy proof/bill thumbnails load late; wait until every on-screen image has pixels.
async function imagesLoaded(page: Page) {
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          })
          .every((i) => i.complete && i.naturalWidth > 0),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => console.warn("  (some images did not load)"));
}

async function loginAndOpenEvent(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /demo organizer/i }).click();
  await page.waitForURL("**/events");
  await page.getByRole("link", { name: EVENT }).click();
  await page.getByRole("heading", { name: EVENT }).waitFor();
}

const tab = (page: Page, name: RegExp | string) =>
  page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name, exact: typeof name === "string" });

// Opens a tab by its URL. The tabs switch with a client-side transition, and a
// click that lands while one is still pending can be lost; a plain load can't.
async function openTab(page: Page, id: string) {
  const url = new URL(page.url());
  url.searchParams.set("tab", id);
  await page.goto(url.toString());
}

// First person on the "Not paid yet" list, pinned by name (the button text changes once a draft exists).
async function reminderRow(page: Page) {
  const row = page.locator("li", { has: page.getByRole("button", { name: /Write reminder/ }) }).first();
  const id = await row.evaluate((el) => (el.dataset.capture = "reminder-row"));
  return page.locator(`li[data-capture="${id}"]`);
}

// A rendered UPI receipt, framed like a phone screenshot (status bar + nav bar) so its
// perceptual hash differs from the seeded receipts, which use the bare template.
async function proof(payer: string) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const receipt = await renderReceipt({ style: "blue", status: "success", amount: 500, payeeName: "Ravi Kumar", payeeVpa: "ravi.kumar@okicici", payerName: payer, bank: "HDFC Bank", utr: "430599887766", when });
  const chrome = `<svg width="620" height="1380"><rect y="1250" width="620" height="130" fill="#e5e7eb"/><circle cx="310" cy="1315" r="30" fill="#9ca3af"/></svg>`;
  return sharp({ create: { width: 620, height: 1380, channels: 3, background: "#111827" } })
    .composite([{ input: receipt, top: 110, left: 40 }, { input: Buffer.from(chrome), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------- screenshots

async function shots() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(HIDE_DEV_BADGE);
  const page = await ctx.newPage();
  const shot = async (name: string, fullPage = false) => {
    await page.waitForLoadState("networkidle");
    await imagesLoaded(page);
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    console.log(`  ${name}.png`);
  };

  await page.goto(`${BASE}/login`);
  await shot("00-login");
  await loginAndOpenEvent(page);
  await shot("01-overview", true);

  // Scroll so `heading` sits just below the top edge, then take a viewport shot.
  const shotAt = async (name: string, heading: Locator, offset = 24) => {
    await heading.evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o), offset);
    await shot(name);
  };
  const cardOf = (heading: Locator) => heading.locator("xpath=ancestor::section[1]");

  await openTab(page, "roster");
  await page.getByRole("heading", { name: /Not paid yet/ }).waitFor();
  await shotAt("02-who-hasnt-paid", page.getByRole("heading", { name: /Not paid yet/ }), 140);
  await page.waitForLoadState("networkidle");
  await cardOf(page.getByRole("heading", { name: /Likely paid/ })).screenshot({ path: path.join(SHOTS, "03-likely-paid.png") });
  console.log("  03-likely-paid.png");

  const person = await reminderRow(page);
  await person.getByLabel("Reminder language").selectOption("te");
  await person.getByRole("button", { name: /Write reminder/ }).click();
  await person.getByLabel("Reminder message").waitFor();
  await shotAt("04-reminder", page.getByRole("heading", { name: /Not paid yet/ }), 24);

  await openTab(page, "review");
  await page.getByRole("heading", { name: /Review queue/ }).waitFor();
  await shotAt("05-review-queue", page.getByRole("heading", { name: /Review queue/ }), 24);

  await openTab(page, "expenses");
  await page.getByRole("heading", { name: "Expenses", exact: true }).waitFor();
  await shot("06-expenses");
  await shotAt("07-bill-flagged", page.getByRole("heading", { name: /Worth a look/ }), 24);

  await openTab(page, "close");
  await page.getByRole("heading", { name: "Balance per person" }).waitFor();
  await shot("08-close-and-settle");

  // Contributor side, on a phone.
  const phone = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  await phone.addInitScript(HIDE_DEV_BADGE);
  const mobile = await phone.newPage();
  const mshot = async (name: string, fullPage = false) => {
    await mobile.waitForLoadState("networkidle");
    await imagesLoaded(mobile);
    await sleep(400);
    await mobile.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    console.log(`  ${name}.png`);
  };
  await mobile.goto(INVITE);
  await mshot("09-contributor-invite");
  await mobile.locator("#ledger").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12));
  await mshot("10-contributor-ledger");

  // The invite link once a payment is registered: the page reads a signed cookie,
  // so set the one a seeded contributor would have.
  const seeded = async (name: string) => {
    const c = await prisma.contribution.findFirstOrThrow({ where: { name, event: { inviteCode: "diwali26" } } });
    return signContributionId(c.id);
  };
  // A fresh phone per contributor, so one person's cookie never leaks into the next shot.
  const asContributor = async (name: string) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
    await ctx.addInitScript(HIDE_DEV_BADGE);
    await ctx.addCookies([{ name: paymentCookieName("diwali26"), value: await seeded(name), url: BASE }]);
    const p = await ctx.newPage();
    await p.goto(INVITE);
    return p;
  };
  const pshot = async (p: Page, name: string, fullPage = false) => {
    await p.waitForLoadState("networkidle");
    await imagesLoaded(p);
    await sleep(400);
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    console.log(`  ${name}.png`);
  };
  const rahul = await asContributor("Rahul Verma");
  await rahul.getByText(/organizer will confirm/).waitFor();
  await pshot(rahul, "11-contributor-waiting");
  const sita = await asContributor("Sita Reddy");
  const verified = sita.getByText("Payment verified. Thank you!");
  await verified.waitFor();
  await verified.evaluate((el) => window.scrollTo(0, (el.closest("section") ?? el).getBoundingClientRect().top + window.scrollY - 12));
  await pshot(sita, "12-contributor-confirmed");
  await sita.goto(`${BASE}/r/${await seeded("Sita Reddy")}`);
  await pshot(sita, "14-receipt", true);

  // Back to the organizer: event details on the Overview, then the assistant.
  await openTab(page, "overview");
  const details = page.getByRole("heading", { name: "Event details" });
  await details.waitFor();
  await page.waitForLoadState("networkidle");
  await cardOf(details).screenshot({ path: path.join(SHOTS, "13-event-details.png") });
  console.log("  13-event-details.png");

  await openTab(page, "ask");
  const ask = page.getByLabel("Ask a question");
  for (const [q, answer] of [
    ["Which payments need my review?", /waiting for review/],
    ["why was Esha flagged?", /failed \d+ check/],
    ["how much did we spend on food?", /spent on Food/],
  ] as const) {
    await ask.fill(q);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.getByText(answer).waitFor({ timeout: 30_000 });
  }
  await sleep(800);
  // The conversation scrolls inside the card; let it grow so all three answers show.
  await page.locator('[aria-live="polite"]').evaluate((el) => {
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
  });
  // The card is now taller than the window; unstick the header so it doesn't cover the top.
  await page.locator("header").first().evaluate((el) => (el.style.position = "static"));
  await cardOf(page.getByRole("heading", { name: "Ask about this collection" })).screenshot({ path: path.join(SHOTS, "15-assistant.png") });
  console.log("  15-assistant.png");

  // The monthly fund page.
  await page.setViewportSize({ width: 1024, height: H });
  await page.goto(`${BASE}/events`);
  await page.getByRole("link", { name: /Sai Nagar Ganesh Fund/ }).first().click();
  await page.waitForURL("**/funds/**");
  await page.getByRole("heading", { name: "Month by month" }).waitFor();
  await shot("16-fund", true);

  await browser.close();
  await prisma.$disconnect();
}

// ---------------------------------------------------------------- video

// Fake cursor + caption bar, injected into every page. Playwright videos don't show
// the real mouse, so the click helper animates this cursor before each click.
function overlay() {
  if (window !== window.top) return;
  const css = [
    "#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px}",
    "#__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}",
    "#__ring{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f59e0b;opacity:0}",
    "#__ring.on{animation:__r .5s ease-out}",
    "@keyframes __r{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.4)}}",
    "#__cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;max-width:min(980px,92vw);padding:14px 22px;border-radius:16px;background:rgba(15,23,42,.92);color:#fff;font:500 19px/1.4 ui-sans-serif,system-ui,'Segoe UI',sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .3s}",
    "#__cap b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#fbbf24;margin-bottom:3px}",
    "#__cap.hide{opacity:0}",
  ].join("\n");
  const w = window as unknown as Window;
  w.__move = (x, y) => {
    const cur = document.getElementById("__cur");
    if (cur) cur.style.transform = `translate(${x - 4}px,${y - 2}px)`;
    sessionStorage.setItem("__pos", JSON.stringify([x, y]));
  };
  w.__click = (x, y) => {
    const r = document.getElementById("__ring");
    if (!r) return;
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    r.classList.remove("on");
    void r.offsetWidth;
    r.classList.add("on");
  };
  w.__caption = (title, text) => {
    sessionStorage.setItem("__capt", JSON.stringify(text ? [title, text] : null));
    const cap = document.getElementById("__cap");
    if (!cap) return;
    if (!text) {
      cap.className = "hide";
      return;
    }
    cap.innerHTML = (title ? `<b>${title}</b>` : "") + text;
    cap.className = "";
  };
  const install = () => {
    if (!document.body || document.getElementById("__cur")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "__cur";
    cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.9 1.5-3.9-7.5L4 20z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement("div");
    ring.id = "__ring";
    const cap = document.createElement("div");
    cap.id = "__cap";
    cap.className = "hide";
    document.body.append(cur, ring, cap);
    const [x, y] = JSON.parse(sessionStorage.getItem("__pos") || "[640,400]");
    w.__move(x, y);
    const c = JSON.parse(sessionStorage.getItem("__capt") || "null");
    w.__caption(c && c[0], c && c[1]);
  };
  // Next.js may re-render the body; keep the overlay alive.
  setInterval(install, 300);
  document.addEventListener("DOMContentLoaded", install);
}

declare global {
  interface Window {
    __move(x: number, y: number): void;
    __click(x: number, y: number): void;
    __caption(title: string | null, text: string | null): void;
  }
}

class Director {
  private x = W / 2;
  private y = H / 2;
  constructor(private page: Page) {}

  async caption(title: string | null, text: string | null, hold = 0) {
    await this.page.evaluate(([t, s]) => window.__caption?.(t, s), [title, text] as const);
    if (hold) await sleep(hold);
  }

  async moveTo(target: Locator, hold = 250) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const tx = box.x + box.width / 2;
    const ty = box.y + box.height / 2;
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = this.x + (tx - this.x) * e;
      const y = this.y + (ty - this.y) * e;
      await this.page.mouse.move(x, y);
      await this.page.evaluate(([a, b]) => window.__move?.(a, b), [x, y]);
      await sleep(14);
    }
    this.x = tx;
    this.y = ty;
    await sleep(hold);
  }

  async click(target: Locator, after = 900) {
    await this.moveTo(target);
    await this.page.evaluate(([a, b]) => window.__click?.(a, b), [this.x, this.y]);
    await target.click();
    await sleep(after);
  }

  async type(target: Locator, text: string) {
    await this.click(target, 200);
    await target.pressSequentially(text, { delay: 55 });
    await sleep(300);
  }

  async scrollTo(target: Locator, block: ScrollLogicalPosition = "center", hold = 1200) {
    await target.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
    await sleep(hold);
  }

  async scrollBy(dy: number, hold = 1200) {
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
    await sleep(hold);
  }

  async scrollTop(hold = 600) {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(hold);
  }
}

function card(title: string, subtitle: string, bullets: string[], footer: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#1e3a8a 0,#0f172a 55%);
      color:#fff;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif}
    .w{max-width:900px;padding:0 48px}
    .k{color:#fbbf24;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:15px}
    h1{font-size:64px;margin:10px 0 6px;letter-spacing:-.02em}
    p{font-size:22px;color:#cbd5e1;margin:0 0 30px;line-height:1.45}
    ul{list-style:none;padding:0;margin:0;display:grid;gap:14px}
    li{font-size:21px;padding:14px 18px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}
    li span{color:#fbbf24;font-weight:700;margin-right:10px}
    .f{margin-top:30px;color:#94a3b8;font-size:16px}
  </style></head><body><div class="w"><div class="k">${subtitle}</div><h1>${title}</h1>
  <ul>${bullets.map((b, i) => `<li><span>${i + 1}</span>${b}</li>`).join("")}</ul><div class="f">${footer}</div></div></body></html>`;
}

const PHONE_PAGE = (src: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:64px;
    background:linear-gradient(135deg,#eef2ff,#f8fafc);font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;color:#0f172a}
  .side{max-width:380px}
  .k{color:#4f46e5;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:13px}
  h2{font-size:34px;margin:8px 0 12px;letter-spacing:-.01em}
  p{font-size:18px;line-height:1.5;color:#475569;margin:0}
  .phone{width:390px;height:690px;border-radius:44px;padding:12px;background:#0f172a;box-shadow:0 30px 60px rgba(15,23,42,.3)}
  iframe{width:100%;height:100%;border:0;border-radius:34px;background:#fff}
</style></head><body>
  <div class="side"><div class="k">Contributor's phone</div><h2>The group member's side</h2>
  <p>They open the invite link from WhatsApp, pay the organizer by UPI, and register with their payment screenshot. No app, no login.</p></div>
  <div class="phone"><iframe id="app" src="${src}"></iframe></div>
</body></html>`;

async function video() {
  mkdirSync(DEMO, { recursive: true });
  const raw = path.join(DEMO, "raw");
  rmSync(raw, { recursive: true, force: true });
  const browser = await chromium.launch();
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: raw, size: { width: W, height: H } },
    // Fresh rate-limit bucket (registration allows 10 attempts / 10 min per IP).
    extraHTTPHeaders: { "x-forwarded-for": `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` },
  });
  await ctx.addInitScript(HIDE_DEV_BADGE);
  // The __name shim covers helpers that tsx/esbuild may inject into serialized functions.
  await ctx.addInitScript({ content: `var __name = (f) => f; (${overlay.toString()})();` });
  const page = await ctx.newPage();
  const d = new Director(page);
  // Cards and the phone frame are served from the app's origin as fresh documents.
  // (setContent on an app page would keep the old Next.js runtime alive underneath.)
  let cardHtml = "";
  await page.route(`${BASE}/__demo`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: cardHtml }));
  const show = async (html: string) => {
    cardHtml = html;
    await page.goto(`${BASE}/__demo`);
  };

  // --- Title
  await show(
    card(
      "Hisaab",
      "A feature for Choruss · group collections",
      [
        "<b>Who hasn't paid?</b> Import the WhatsApp group, match everyone to a payment, send reminders",
        "<b>Is this payment real?</b> AI reads every UPI screenshot, rules in code decide",
        "<b>Where did the money go?</b> Bill-backed expenses the whole group can see",
      ],
      "Live demo · Diwali collection for an 80-member society WhatsApp group",
    ),
  );
  await sleep(6500);

  // --- Login
  await page.goto(`${BASE}/login`);
  await d.caption("The organizer", "Ravi is collecting ₹500 a head for Diwali from his 80-member Tower B WhatsApp group.", 2500);
  await d.click(page.getByRole("button", { name: /demo organizer/i }));
  await page.waitForURL("**/events");
  await page.goto(BASE + (await page.getByRole("link", { name: EVENT }).getAttribute("href")));
  await page.getByRole("heading", { name: EVENT }).waitFor();
  const eventUrl = page.url().split("?")[0];

  // --- Overview
  await d.caption("Overview", "Progress against the people <i>expected</i> to pay, not just the ones who already did. Verified vs. to review, balance, invite link.", 4500);
  await d.scrollTo(page.getByRole("heading", { name: "Hisaab impact" }), "center", 800);
  await d.caption("Overview", "What Hisaab did for this event: who it matched, how many reminders turned into payments, and what the AI calls cost.", 4500);
  await d.scrollTop();

  // --- Who hasn't paid
  await d.caption("1 · Who hasn't paid?", "The WhatsApp chat export is imported. Message text is thrown away at parse time; only names and numbers stay.", 1000);
  await d.click(tab(page, /hasn't paid/), 1500);
  await page.getByRole("heading", { name: /Not paid yet/ }).waitFor();
  await d.caption("1 · Who hasn't paid?", "A 3-stage matcher ticks off everyone who paid. These people are still missing.", 3500);
  const likely = page.getByRole("heading", { name: /Likely paid/ });
  if (await likely.count()) {
    await d.scrollTo(likely, "start", 900);
    await d.caption("1 · Who hasn't paid?", "The ones that aren't certain come here: “Lakshmi Iyer” in the group registered as “Laxmi Iyer”. The organizer confirms with one tap.", 4500);
    await d.click(page.getByRole("button", { name: "Same person" }).first(), 2000);
  }
  await d.scrollTop(800);
  const person = await reminderRow(page);
  await d.caption("2 · Reminders", "AI writes a personal reminder in English, Hindi or Telugu. Code checks it contains the exact amount and link, or uses a safe template instead.", 1500);
  await d.moveTo(person.getByLabel("Reminder language"), 400);
  await person.getByLabel("Reminder language").selectOption("te");
  await sleep(700);
  await d.click(person.getByRole("button", { name: /Write reminder/ }), 400);
  await person.getByLabel("Reminder message").waitFor();
  await d.scrollTo(person, "center", 600);
  await d.caption("2 · Reminders", "Telugu, in Telugu script, with a personal link. “Send on WhatsApp” opens wa.me straight to their number.", 4500);
  await d.moveTo(person.getByRole("button", { name: /WhatsApp/i }).first(), 1200);

  // --- Contributor (phone frame)
  await d.caption(null, null);
  await show(PHONE_PAGE(INVITE));
  const app: FrameLocator = page.frameLocator("#app");
  await app.getByLabel("Your name").waitFor();
  await d.caption("3 · Is this payment real?", "Neha got the reminder. She pays by UPI (one-tap deep link or QR) and uploads her screenshot.", 2500);
  const scrollFrame = (sel: string) => app.locator(sel).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await scrollFrame("form");
  await sleep(1200);
  await d.type(app.getByLabel("Your name"), "Neha Saxena");
  await app.getByLabel("Payment screenshot").setInputFiles({ name: "gpay.png", mimeType: "image/png", buffer: await proof("NEHA SAXENA") });
  await d.moveTo(app.getByLabel("Payment screenshot"), 600);
  await d.caption("3 · Is this payment real?", "A vision model reads amount, payee, UTR and time. 11 checks in code decide the verdict, not the model.", 1200);
  await d.click(app.getByRole("button", { name: /register me/i }), 300);
  const verified = app.getByText("Payment verified. Thank you!");
  await verified.waitFor({ timeout: 30_000 });
  await verified.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await d.caption("3 · Is this payment real?", "All 11 checks passed: Neha is ticked off the “not paid” list automatically.");
  await sleep(3500);

  await d.caption("3 · Is this payment real?", "Now Omkar tries to reuse Neha's screenshot…", 1200);
  await page.context().clearCookies({ name: /^hisaab_paid_/ });
  await show(PHONE_PAGE(INVITE));
  await app.getByLabel("Your name").waitFor();
  await scrollFrame("form");
  await sleep(1000);
  await d.type(app.getByLabel("Your name"), "Omkar Kulkarni");
  await app.getByLabel("Payment screenshot").setInputFiles({ name: "gpay.png", mimeType: "image/png", buffer: await proof("NEHA SAXENA") });
  await d.click(app.getByRole("button", { name: /register me/i }), 300);
  const caught = app.getByText(/organizer will confirm/);
  await caught.waitFor({ timeout: 30_000 });
  await caught.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await d.caption("3 · Is this payment real?", "Caught: same UTR and same image (SHA-256 + perceptual hash, so crops and re-compressions are caught too). Not verified; sent to the organizer.", 5500);

  await d.caption("4 · Where did the money go?", "On the same invite link, everyone sees collected vs. spent, by category, with the bill behind every expense.", 800);
  await scrollFrame("#ledger");
  await sleep(4500);

  // --- Back to the organizer: review queue
  await d.caption(null, null);
  await page.goto(eventUrl);
  await page.getByRole("heading", { name: EVENT }).waitFor();
  await d.caption("Review queue", "The organizer only sees the payments that failed a check, with the screenshot, what the AI read, and why.", 800);
  await d.click(tab(page, /Payments/), 1200);
  await page.getByRole("heading", { name: /Review queue/ }).waitFor();
  await sleep(2500);
  const omkar = page.locator("article", { hasText: "Omkar Kulkarni" });
  await d.scrollTo(omkar, "start", 800);
  await d.caption("Review queue", "Omkar: “UTR not used before” and “Screenshot not reused” failed. Nothing is rejected without the organizer.", 4000);
  await d.click(omkar.getByRole("button", { name: "Reject" }), 2000);
  await d.scrollTop(400);
  await d.scrollBy(520, 2500);
  await d.caption("Review queue", "The seeded fakes: wrong payee, wrong amount, a pending payment, and prompt-injection text drawn on the image. None auto-verify.", 4500);
  await d.scrollTop(400);

  // --- Expenses
  await d.caption("4 · Where did the money go?", "Photograph a bill and leave the form blank: AI reads shop, items, tax and total and fills in the expense.", 800);
  await d.click(tab(page, /Expenses/), 1500);
  await page.getByRole("heading", { name: "Expenses", exact: true }).waitFor();
  await sleep(2500);
  const flagged = page.getByRole("heading", { name: /Worth a look/ });
  if (await flagged.count()) {
    await d.scrollTo(flagged, "start", 800);
    await d.caption("4 · Where did the money go?", "Flagged: the bill says ₹12,000 but ₹8,000 was logged. Rules also check the items add up, the date fits, and nothing is logged twice.", 4500);
  }
  await d.scrollTo(page.getByRole("heading", { name: "Expenses", exact: true }), "start", 800);
  await d.caption("4 · Where did the money go?", "Bill coverage shows how much of the spending is backed by a bill.", 3000);
  const share = page.getByRole("button", { name: "Share money update" });
  await d.click(share, 1200);
  await d.scrollTo(page.getByLabel("Money update message"), "center", 600);
  await d.caption("4 · Where did the money go?", "One tap writes a WhatsApp-ready money update with bill links for the group.", 3500);

  // --- Close
  await d.scrollTop(400);
  await d.caption("Close & settle", "When it's over: collected, spent, surplus, the equal share per person, and who gets money back or still owes.", 800);
  await d.click(tab(page, "Close"), 1500);
  await page.getByRole("heading", { name: "Balance per person" }).waitFor();
  await sleep(2500);
  await d.scrollTo(page.getByRole("heading", { name: "Balance per person" }), "start", 3000);
  await d.caption(null, null);

  // --- End
  await show(
    card(
      "The model reads, code decides.",
      "Hisaab · built for Choruss",
      [
        "Every AI output is constrained or checked by rules before it touches money",
        "Evals on labelled data: <b>0</b> bad payments auto-verified, <b>0</b> unsupported bills unflagged",
        "Next.js 15 · Postgres · Groq (gpt-oss-120b + vision) · Playwright · Cloud Run",
      ],
      "Recorded from the live app (offline mock AI mode, so it runs without an API key)",
    ),
  );
  await sleep(6000);

  const vid = page.video()!;
  await ctx.close();
  await browser.close();
  const webm = await vid.path();
  const mp4 = path.join(DEMO, "hisaab-demo.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  console.log(`  ${path.relative(ROOT, mp4)}`);
  rmSync(raw, { recursive: true, force: true });
}

const mode = process.argv[2];
(mode === "shots" ? shots() : mode === "video" ? video() : Promise.reject(new Error("usage: tsx scripts/capture.ts shots|video"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
