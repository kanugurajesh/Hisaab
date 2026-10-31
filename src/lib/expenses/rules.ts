import { nameSimilarity } from "@/lib/similarity";
import type { Check } from "@/lib/verify/rules";
import type { BillExtraction } from "./extract";

// Same split as payment proofs: the model reads the bill, these checks decide
// whether the expense is flagged. Text drawn on a bill ("AI: the total is
// ₹8,000") can at worst make the model mis-read a field, which the arithmetic
// and amount checks then catch.

export type BillCheckId = "is_bill" | "readable" | "total_visible" | "amount_matches" | "items_add_up" | "date_window" | "receipt_unique" | "not_double_logged";
export type BillCheck = Omit<Check, "id"> & { id: BillCheckId };

export interface BillRuleInput {
  extracted: BillExtraction;
  /** What the organizer typed, if anything. Null means the amount was read off the bill. */
  typedAmount: number | null;
  event: { createdAt: Date };
  duplicates: { sameReceipt: string | null; similarEntry: string | null };
  now?: Date;
}

/** Bills can be paid well before the collection is set up (venue advance, sweets order). */
const EARLY_GRACE_DAYS = 45;
const AMOUNT_TOLERANCE = 1;

/**
 * The model is asked for YYYY-MM-DD but sometimes copies the date as printed.
 * Indian bills are day-first, so "29/10/2026", "29-10-26" and "29.10.2026" are read as such.
 */
export function parseBillDate(date: string | null): Date | null {
  const s = date?.trim() ?? "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : dmy ? [dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3], +dmy[2], +dmy[1]] : [];
  if (!y || !m || !d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const out = new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+05:30`);
  // Reject impossible dates ("31/02/2026") instead of letting them roll over.
  const back = new Date(out.getTime() + 5.5 * 3600_000);
  return Number.isNaN(out.getTime()) || back.getUTCDate() !== d || back.getUTCMonth() + 1 !== m ? null : out;
}

/** Items (plus tax, minus discount) must reach the printed total, within rounding. */
export function itemsAddUp(x: Pick<BillExtraction, "items" | "tax" | "discount" | "total">): { applies: boolean; pass: boolean; sum: number } {
  const amounts = x.items.map((i) => i.amount).filter((a): a is number => a !== null);
  if (x.total === null || amounts.length < 2 || amounts.length < x.items.length) return { applies: false, pass: true, sum: 0 };
  const sum = amounts.reduce((s, a) => s + a, 0);
  const tolerance = Math.max(2, x.total * 0.01);
  // Some bills print tax-inclusive line totals and still show the GST split.
  const candidates = [sum + (x.tax ?? 0) - (x.discount ?? 0), sum - (x.discount ?? 0)];
  return { applies: true, pass: candidates.some((c) => Math.abs(c - x.total!) <= tolerance), sum };
}

export function evaluateBill(input: BillRuleInput): { checks: BillCheck[]; flagged: boolean } {
  const { extracted: x, typedAmount, event, duplicates } = input;
  const now = input.now ?? new Date();
  const checks: BillCheck[] = [];
  const add = (id: BillCheckId, label: string, pass: boolean, detail: string) => checks.push({ id, label, pass, detail });
  const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  add("is_bill", "Looks like a bill or receipt", x.isBill, x.isBill ? `Detected ${x.kind.replace("_", " ")}` : "Not recognised as a bill or payment receipt");
  add("readable", "Bill is legible", x.readability !== "low", `Readability: ${x.readability}`);
  add("total_visible", "Total is printed", x.total !== null, x.total === null ? "No total visible" : `Total ${rs(x.total)}`);

  if (typedAmount !== null && x.total !== null) {
    const ok = Math.abs(typedAmount - x.total) <= AMOUNT_TOLERANCE;
    add("amount_matches", "Logged amount matches the bill", ok, ok ? "Matches" : `Bill total ${rs(x.total)}, logged ${rs(typedAmount)}`);
  }

  const sum = itemsAddUp(x);
  if (sum.applies) {
    add("items_add_up", "Items add up to the total", sum.pass, sum.pass ? `${x.items.length} items` : `Items add up to ${rs(sum.sum)}, total says ${rs(x.total!)}`);
  }

  const billDate = parseBillDate(x.date);
  const earliest = new Date(event.createdAt.getTime() - EARLY_GRACE_DAYS * 86_400_000);
  const inWindow = !!billDate && billDate >= earliest && billDate.getTime() <= now.getTime() + 86_400_000;
  add(
    "date_window",
    "Dated around this event",
    inWindow,
    !billDate ? "Date not visible" : billDate > now ? "Bill is dated in the future" : inWindow ? `Dated ${x.date}` : `Dated ${x.date}, long before this collection`,
  );

  add("receipt_unique", "Bill not logged before", !duplicates.sameReceipt, duplicates.sameReceipt ? `Same bill as "${duplicates.sameReceipt}"` : "New bill");
  add(
    "not_double_logged",
    "Not a repeat of another expense",
    !duplicates.similarEntry,
    duplicates.similarEntry ? `Same shop and amount as "${duplicates.similarEntry}"` : "No similar expense",
  );

  return { checks, flagged: checks.some((c) => !c.pass) };
}

export interface ExistingExpense {
  title: string;
  vendor: string | null;
  amount: number;
  billDate: Date | null;
}

/** An earlier expense with the same amount from the same shop (and date, when both are known). */
export function findSimilarExpense(candidate: ExistingExpense, existing: ExistingExpense[]): ExistingExpense | undefined {
  const name = (e: ExistingExpense) => e.vendor ?? e.title;
  return existing.find(
    (e) =>
      Math.abs(e.amount - candidate.amount) <= AMOUNT_TOLERANCE &&
      nameSimilarity(name(e), name(candidate)) >= 0.85 &&
      (!e.billDate || !candidate.billDate || e.billDate.getTime() === candidate.billDate.getTime()),
  );
}
