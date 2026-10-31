import sharp from "sharp";

// Synthetic shop bills for evals, seed data and e2e tests: a thermal-printer
// slip, a GST tax invoice and a handwritten cash memo.

export interface BillSpec {
  style: "thermal" | "invoice" | "handwritten";
  vendor: string;
  items: [name: string, amount: number][];
  /** GST added on top of the items. */
  tax?: number;
  /** Printed total. Defaults to items + tax; set it to draw a total that doesn't add up. */
  total?: number;
  /** e.g. "29/10/2026" */
  date: string;
  /** Prompt-injection text drawn on the bill. */
  injection?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rs = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function billTotal(b: BillSpec): number {
  return b.total ?? b.items.reduce((s, [, a]) => s + a, 0) + (b.tax ?? 0);
}

export function billSvg(b: BillSpec): string {
  const total = billTotal(b);
  const sub = b.items.reduce((s, [, a]) => s + a, 0);
  const W = b.style === "invoice" ? 760 : 520;
  const font = b.style === "thermal" ? "Courier New, monospace" : b.style === "handwritten" ? "Segoe Print, Comic Sans MS, cursive" : "Arial, sans-serif";
  const ink = b.style === "handwritten" ? "#1c3d8f" : "#111";
  const bg = b.style === "thermal" ? "#fbfaf6" : b.style === "handwritten" ? "#fff8e7" : "#ffffff";
  let y = 70;
  const parts: string[] = [];
  const text = (x: number, t: string, size = 22, anchor = "start", weight = "normal") => {
    parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${ink}">${esc(t)}</text>`);
  };
  const line = () => {
    parts.push(`<line x1="30" x2="${W - 30}" y1="${y - 18}" y2="${y - 18}" stroke="${ink}" stroke-dasharray="${b.style === "thermal" ? "6 4" : "0"}"/>`);
    y += 14;
  };

  text(W / 2, b.vendor.toUpperCase(), b.style === "invoice" ? 34 : 28, "middle", "bold");
  y += 34;
  if (b.style !== "handwritten") {
    text(W / 2, "Main Road, Kukatpally, Hyderabad", 18, "middle");
    y += 26;
    text(W / 2, "GSTIN: 36ABCDE1234F1Z5", 18, "middle");
    y += 30;
  }
  text(W / 2, b.style === "invoice" ? "TAX INVOICE" : b.style === "handwritten" ? "CASH MEMO" : "BILL OF SUPPLY", 20, "middle", "bold");
  y += 40;
  text(40, `Bill No: ${100 + b.items.length * 37}`, 20);
  text(W - 40, `Date: ${b.date}`, 20, "end");
  y += 34;
  line();
  text(40, "Item", 20, "start", "bold");
  text(W - 40, "Amount", 20, "end", "bold");
  y += 36;
  for (const [name, amt] of b.items) {
    text(40, name, 21);
    text(W - 40, rs(amt), 21, "end");
    y += 34;
  }
  line();
  if (b.tax) {
    text(40, "Sub total", 20);
    text(W - 40, rs(sub), 20, "end");
    y += 32;
    text(40, "CGST 2.5% + SGST 2.5%", 20);
    text(W - 40, rs(b.tax), 20, "end");
    y += 36;
  }
  text(40, "GRAND TOTAL", 26, "start", "bold");
  text(W - 40, `Rs. ${rs(total)}`, 26, "end", "bold");
  y += 50;
  text(W / 2, "Thank you! Visit again", 18, "middle");
  y += 40;
  if (b.injection) {
    text(40, b.injection, 16);
    y += 30;
  }
  const H = y + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${font}"><rect width="${W}" height="${H}" fill="${bg}"/>${parts.join("")}</svg>`;
}

export async function renderBill(b: BillSpec): Promise<Buffer> {
  return sharp(Buffer.from(billSvg(b))).png().toBuffer();
}
