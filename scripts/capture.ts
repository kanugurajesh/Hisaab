// Captures README screenshots and a narrated demo video of the running app.
//
//   npm run db:seed && npx tsx scripts/capture.ts shots   -> docs/screenshots/*.png
//   npm run db:seed && npx tsx scripts/capture.ts video   -> docs/demo/hisaab-demo.mp4
//
// Needs the app on APP_URL (default http://localhost:3000) with AI_MOCK=true and
// DEMO_LOGIN=true, freshly seeded. The video run registers two payments and rejects
// one, so re-seed afterwards to get the demo data back. ffmpeg must be on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, devices, type BrowserContext, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { renderReceipt } from "../eval/lib/renderReceipt";

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

async function loginAndOpenEvent(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /demo organizer/i }).click();
  await page.waitForURL("**/events");
  await page.getByRole("link", { name: EVENT }).click();
  await page.getByRole("heading", { name: EVENT }).waitFor();
}

const tab = (page: Page, name: RegExp | string) =>
  page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name, exact: typeof name === "string" });

async function proof(payer: string) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  return renderReceipt({ style: "purple", status: "success", amount: 500, payeeName: "Ravi Kumar", payeeVpa: "ravi.kumar@okicici", payerName: payer, bank: "HDFC Bank", utr: "430599887766", when });
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
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    console.log(`  ${name}.png`);
  };

  await page.goto(`${BASE}/login`);
  await shot("00-login");
  await loginAndOpenEvent(page);
  await shot("01-overview", true);

  await tab(page, /hasn't paid/).click();
  await page.getByRole("heading", { name: /Not paid yet/ }).waitFor();
  await shot("02-who-hasnt-paid", true);

  const person = page.locator("li", { has: page.getByRole("button", { name: /Write reminder/ }) }).first();
  await person.getByLabel("Reminder language").selectOption("te");
  await person.getByRole("button", { name: /Write reminder/ }).click();
  await person.getByLabel("Reminder message").waitFor();
  await person.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await shot("03-reminder");

  await tab(page, /Payments/).click();
  await page.getByRole("heading", { name: /Review queue/ }).waitFor();
  await shot("04-review-queue");

  await tab(page, /Expenses/).click();
  await page.getByRole("heading", { name: "Expenses", exact: true }).waitFor();
  await shot("05-expenses", true);

  await tab(page, "Close").click();
  await page.getByRole("heading", { name: "Balance per person" }).waitFor();
  await shot("06-close-and-settle");

  // Contributor side, on a phone.
  const phone = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  await phone.addInitScript(HIDE_DEV_BADGE);
  const mobile = await phone.newPage();
  const mshot = async (name: string, fullPage = false) => {
    await mobile.waitForLoadState("networkidle");
    await sleep(400);
    await mobile.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
    console.log(`  ${name}.png`);
  };
  await mobile.goto(INVITE);
  await mshot("07-contributor-invite");
  await mobile.locator("#ledger").scrollIntoViewIfNeeded();
  await mshot("08-contributor-ledger");

  await browser.close();
}

// ---------------------------------------------------------------- video

// Fake cursor + caption bar, injected into every page. Playwright videos don't show
// the real mouse, so the click helper animates this cursor before each click.
const OVERLAY = String.raw`(() => {
  if (window !== window.top) return;
  const css = \`
    #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;transition:transform .05s linear}
    #__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    #__ring{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      border:3px solid #f59e0b;opacity:0;transform:scale(.4)}
    #__ring.on{animation:__r .5s ease-out}
    @keyframes __r{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.4)}}
    #__cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;
      max-width:min(980px,92vw);padding:14px 22px;border-radius:16px;background:rgba(15,23,42,.92);color:#fff;
      font:500 19px/1.4 ui-sans-serif,system-ui,'Segoe UI',sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);
      transition:opacity .3s}
    #__cap b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#fbbf24;margin-bottom:3px}
    #__cap.hide{opacity:0}\`;
  function install() {
    if (!document.body || document.getElementById('__cur')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const cur = document.createElement('div'); cur.id = '__cur';
    cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.9 1.5-3.9-7.5L4 20z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div'); ring.id = '__ring';
    const cap = document.createElement('div'); cap.id = '__cap'; cap.className = 'hide';
    document.body.append(cur, ring, cap);
    const pos = JSON.parse(sessionStorage.getItem('__pos') || '[640,400]');
    window.__move(pos[0], pos[1]);
    const c = JSON.parse(sessionStorage.getItem('__capt') || 'null');
    window.__caption(c && c[0], c && c[1]);
  }
  window.__move = (x, y) => {
    const cur = document.getElementById('__cur');
    if (cur) cur.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)';
    sessionStorage.setItem('__pos', JSON.stringify([x, y]));
  };
  window.__click = (x, y) => {
    const r = document.getElementById('__ring'); if (!r) return;
    r.style.left = x + 'px'; r.style.top = y + 'px';
    r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
  };
  window.__caption = (title, text) => {
    sessionStorage.setItem('__capt', JSON.stringify(text ? [title, text] : null));
    const cap = document.getElementById('__cap'); if (!cap) return;
    if (!text) { cap.className = 'hide'; return; }
    cap.innerHTML = (title ? '<b>' + title + '</b>' : '') + text;
    cap.className = '';
  };
  // Next.js may re-render the body; keep the overlay alive.
  setInterval(install, 300);
  document.addEventListener('DOMContentLoaded', install);
})();`;

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
  });
  await ctx.addInitScript(HIDE_DEV_BADGE);
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const d = new Director(page);

  // --- Title
  await page.setContent(
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
  await d.caption("The organizer", "Each collection lives here. Let's open the Diwali one.", 1500);
  await d.click(page.getByRole("link", { name: EVENT }), 1200);
  await page.getByRole("heading", { name: EVENT }).waitFor();

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
    await d.caption("1 · Who hasn't paid?", "The ones that aren't certain come here: “Seenu 🪔” in the group registered as “Srinivas Rao”. The organizer confirms with one tap.", 4500);
    await d.click(page.getByRole("button", { name: "Same person" }).first(), 2000);
  }
  await d.scrollTop(800);
  const person = page.locator("li", { has: page.getByRole("button", { name: /Write reminder/ }) }).first();
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
  await page.setContent(PHONE_PAGE(INVITE));
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
  await app.getByText("Payment verified. Thank you!").waitFor({ timeout: 30_000 });
  await scrollFrame("main");
  await sleep(3500);

  await d.caption("3 · Is this payment real?", "Now Omkar tries to reuse Neha's screenshot…", 1200);
  await page.setContent(PHONE_PAGE(INVITE));
  await app.getByLabel("Your name").waitFor();
  await scrollFrame("form");
  await sleep(1000);
  await d.type(app.getByLabel("Your name"), "Omkar Kulkarni");
  await app.getByLabel("Payment screenshot").setInputFiles({ name: "gpay.png", mimeType: "image/png", buffer: await proof("NEHA SAXENA") });
  await d.click(app.getByRole("button", { name: /register me/i }), 300);
  await app.getByText(/organizer will confirm/).waitFor({ timeout: 30_000 });
  await scrollFrame("main");
  await d.caption("3 · Is this payment real?", "Caught: same UTR and same image (SHA-256 + perceptual hash, so crops and re-compressions are caught too). Not verified; sent to the organizer.", 5500);

  await d.caption("4 · Where did the money go?", "On the same invite link, everyone sees collected vs. spent, by category, with the bill behind every expense.", 800);
  await scrollFrame("#ledger");
  await sleep(4500);

  // --- Back to the organizer: review queue
  await d.caption(null, null);
  await loginAndOpenEvent(page);
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
    await d.caption("4 · Where did the money go?", "Rules check every bill: typed amount matches the total, line items add up, the date fits, and it isn't logged twice.", 4500);
  }
  await d.scrollTo(page.getByRole("heading", { name: "Expenses", exact: true }), "start", 800);
  await d.caption("4 · Where did the money go?", "Bill coverage shows how much of the spending is backed by a bill.", 3000);
  const share = page.getByRole("button", { name: "Share money update" });
  await d.click(share, 1200);
  await d.scrollTo(page.getByLabel("Money update message"), "center", 600);
  await d.caption("4 · Where did the money go?", "One tap writes a WhatsApp-ready money update with bill links for the group.", 3500);

  // --- Close
  await d.scrollTop(400);
  await d.caption("Close & settle", "When it's over: collected, spent, surplus, and each person's share. “Gets back ₹120” / “owes ₹80”.", 800);
  await d.click(tab(page, "Close"), 1500);
  await page.getByRole("heading", { name: "Balance per person" }).waitFor();
  await sleep(2500);
  await d.scrollTo(page.getByRole("heading", { name: "Balance per person" }), "start", 3000);
  await d.caption(null, null);

  // --- End
  await page.setContent(
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
