import sharp from "sharp";

// Synthetic UPI confirmation screens for evals, seed data and e2e tests.
// Deliberately generic (no real app logos); layout varies by "style" so the
// vision model sees different arrangements of the same fields.

export interface ReceiptSpec {
  style: "blue" | "purple" | "teal";
  status: "success" | "pending" | "failed";
  amount: number;
  payeeName: string;
  payeeVpa: string | null;
  payerName: string;
  bank: string;
  utr: string;
  /** e.g. "30 Oct 2026, 7:42 pm" */
  when: string;
  /** Prompt-injection text drawn on the screenshot. */
  injection?: string;
  blur?: number;
}

const STYLES = {
  blue: { bg: "#ffffff", header: "#1a73e8", fg: "#202124", sub: "#5f6368" },
  purple: { bg: "#f4effa", header: "#5f259f", fg: "#1d1d1f", sub: "#6b6b76" },
  teal: { bg: "#eef9fc", header: "#00b9f1", fg: "#102a43", sub: "#52606d" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function receiptSvg(r: ReceiptSpec): string {
  const c = STYLES[r.style];
  const statusText = { success: "Payment successful", pending: "Payment pending", failed: "Payment failed" }[r.status];
  const statusColor = { success: "#1e8e3e", pending: "#f29900", failed: "#d93025" }[r.status];
  const icon = { success: "✓", pending: "…", failed: "✕" }[r.status];
  const amount = `₹${r.amount.toLocaleString("en-IN")}`;
  const rows: [string, string][] = [
    ["To", r.payeeName],
    ...(r.payeeVpa ? ([["UPI ID", r.payeeVpa]] as [string, string][]) : []),
    ["From", `${r.payerName} (${r.bank})`],
    ["UPI transaction ID", r.utr],
    ["Date", r.when],
  ];
  const top = r.style === "purple" ? 300 : 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1100" font-family="Segoe UI, Roboto, Arial, sans-serif">
  <rect width="540" height="1100" fill="${c.bg}"/>
  <rect width="540" height="${r.style === "purple" ? 240 : 70}" fill="${c.header}"/>
  <text x="24" y="44" font-size="22" fill="#fff">9:41</text>
  <circle cx="270" cy="${r.style === "purple" ? 150 : 170}" r="48" fill="${statusColor}"/>
  <text x="270" y="${r.style === "purple" ? 168 : 188}" font-size="52" fill="#fff" text-anchor="middle">${icon}</text>
  <text x="270" y="${top - 40}" font-size="26" fill="${c.fg}" text-anchor="middle">${statusText}</text>
  <text x="270" y="${top + 30}" font-size="64" font-weight="bold" fill="${c.fg}" text-anchor="middle">${esc(amount)}</text>
  ${rows
    .map(
      ([k, v], i) => `<text x="40" y="${top + 120 + i * 90}" font-size="20" fill="${c.sub}">${esc(k)}</text>
  <text x="40" y="${top + 152 + i * 90}" font-size="26" fill="${c.fg}">${esc(v)}</text>`,
    )
    .join("\n  ")}
  ${r.injection ? `<text x="40" y="1060" font-size="18" fill="${c.sub}">${esc(r.injection)}</text>` : ""}
</svg>`;
}

export async function renderReceipt(r: ReceiptSpec): Promise<Buffer> {
  let img = sharp(Buffer.from(receiptSvg(r)));
  if (r.blur) img = img.blur(r.blur);
  return img.png().toBuffer();
}
