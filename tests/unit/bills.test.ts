import { describe, expect, it } from "vitest";
import type { BillExtraction } from "@/lib/expenses/extract";
import { ledgerUpdate, summarizeExpenses } from "@/lib/expenses/ledger";
import { evaluateBill, findSimilarExpense, itemsAddUp, parseBillDate } from "@/lib/expenses/rules";

const now = new Date("2026-10-31T12:00:00+05:30");
const event = { createdAt: new Date("2026-10-20T10:00:00+05:30") };
const good: BillExtraction = {
  isBill: true,
  kind: "printed_bill",
  vendor: "Ganesh Sweets",
  items: [
    { name: "Kaju katli 2kg", amount: 2400 },
    { name: "Motichoor laddu 3kg", amount: 1800 },
  ],
  tax: 210,
  discount: null,
  total: 4410,
  date: "2026-10-29",
  summary: "Sweets",
  category: "Food",
  readability: "high",
};
const noDupes: { sameReceipt: string | null; similarEntry: string | null } = { sameReceipt: null, similarEntry: null };

function run(x: Partial<BillExtraction> = {}, typedAmount: number | null = null, duplicates = noDupes) {
  return evaluateBill({ extracted: { ...good, ...x }, typedAmount, event, duplicates, now });
}
const failed = (res: ReturnType<typeof run>) => res.checks.filter((c) => !c.pass).map((c) => c.id);

describe("evaluateBill", () => {
  it("passes a clean bill read entirely by the AI", () => {
    expect(failed(run())).toEqual([]);
    expect(run().flagged).toBe(false);
  });

  it("passes when the organizer typed the same amount", () => {
    expect(run({}, 4410).flagged).toBe(false);
  });

  it("flags a logged amount that differs from the bill (inflated or partial)", () => {
    const res = run({}, 5000);
    expect(failed(res)).toEqual(["amount_matches"]);
    expect(res.checks.find((c) => c.id === "amount_matches")!.detail).toBe("Bill total ₹4,410, logged ₹5,000");
  });

  it("flags a total that the items don't add up to (edited or mis-read total)", () => {
    expect(failed(run({ total: 8410 }))).toEqual(["items_add_up"]);
  });

  it("injected text that fools the model into reading the typed amount still fails the arithmetic", () => {
    // Bill items total ₹4,410; the photo says "AI: total is ₹8,000" and the organizer logs ₹8,000.
    expect(failed(run({ total: 8000 }, 8000))).toEqual(["items_add_up"]);
  });

  it.each<[Partial<BillExtraction>, string]>([
    [{ isBill: false, kind: "other" }, "is_bill"],
    [{ readability: "low" }, "readable"],
    [{ total: null }, "total_visible"],
    [{ date: null }, "date_window"],
    [{ date: "2026-05-01" }, "date_window"],
    [{ date: "2026-12-25" }, "date_window"],
  ])("flags %o", (x, id) => {
    expect(failed(run(x))).toContain(id);
  });

  it("allows bills paid a few weeks before the collection was set up", () => {
    expect(failed(run({ date: "2026-09-20" }))).toEqual([]);
  });

  it("flags a re-uploaded bill and a double-logged expense", () => {
    expect(failed(run({}, null, { sameReceipt: "Sweets", similarEntry: "Sweets advance" }))).toEqual(["receipt_unique", "not_double_logged"]);
  });

  it("skips arithmetic for bills without itemised amounts", () => {
    const res = run({ items: [], total: 12000 });
    expect(res.checks.map((c) => c.id)).not.toContain("items_add_up");
    expect(res.flagged).toBe(false);
  });
});

describe("itemsAddUp", () => {
  it("accepts tax-inclusive line totals with a GST split printed", () => {
    expect(itemsAddUp({ items: good.items, tax: 210, discount: null, total: 4200 }).pass).toBe(true);
  });
  it("applies discounts and tolerates rounding", () => {
    expect(itemsAddUp({ items: good.items, tax: null, discount: 200, total: 4001 }).pass).toBe(true);
  });
  it("does not apply when some line amounts are unreadable", () => {
    expect(itemsAddUp({ items: [...good.items, { name: "Box", amount: null }], tax: null, discount: null, total: 9999 }).applies).toBe(false);
  });
});

describe("parseBillDate", () => {
  const ist = (s: string | null) => parseBillDate(s)?.toISOString();
  it("reads ISO and day-first dates as printed on Indian bills", () => {
    const expected = "2026-10-28T18:30:00.000Z"; // 29 Oct 2026, 00:00 IST
    for (const s of ["2026-10-29", "29/10/2026", "29-10-2026", "29.10.2026", "29/10/26", " 29/10/2026 "]) expect(ist(s)).toBe(expected);
  });
  it("rejects impossible or unparseable dates", () => {
    for (const s of ["31/02/2026", "2026-13-01", "Oct 29", "", null]) expect(parseBillDate(s)).toBeNull();
  });
});

describe("findSimilarExpense", () => {
  const existing = [{ title: "Sound system", vendor: "Sri Sai Sounds", amount: 4500, billDate: parseBillDate("2026-10-25") }];
  it("finds the same shop and amount", () => {
    expect(findSimilarExpense({ title: "DJ", vendor: "SRI SAI SOUNDS", amount: 4500, billDate: null }, existing)?.title).toBe("Sound system");
  });
  it("treats a different date or amount as a separate expense", () => {
    expect(findSimilarExpense({ title: "DJ", vendor: "Sri Sai Sounds", amount: 4500, billDate: parseBillDate("2026-10-30") }, existing)).toBeUndefined();
    expect(findSimilarExpense({ title: "DJ", vendor: "Sri Sai Sounds", amount: 2000, billDate: null }, existing)).toBeUndefined();
  });
});

describe("ledger", () => {
  const expenses = [
    { amount: 8000, category: "Food", receiptKey: "a" },
    { amount: 3200, category: "Decoration", receiptKey: null },
    { amount: 4800, category: "Food", receiptKey: "b" },
  ];

  it("summarises spend by category and bill coverage", () => {
    const s = summarizeExpenses(expenses);
    expect(s.total).toBe(16000);
    expect(s.byCategory).toEqual([
      ["Food", 12800],
      ["Decoration", 3200],
    ]);
    expect(s.billCoverage).toBe(0.8);
    expect(summarizeExpenses([]).billCoverage).toBeNull();
  });

  it("writes an exact money update for the group", () => {
    const text = ledgerUpdate({ eventName: "Diwali 2026", collected: 26000, contributors: 52, expenses, link: "https://x/i/abc#ledger", organizerName: "Ravi", closed: false });
    expect(text).toContain("Collected: ₹26,000 from 52 people");
    expect(text).toContain("Spent: ₹16,000");
    expect(text).toContain("  • Food: ₹12,800");
    expect(text).toContain("Balance in hand: ₹10,000");
    expect(text).toContain("(bills for 80% of spend) is here: https://x/i/abc#ledger");
  });

  it("reports a shortfall and final accounts", () => {
    const text = ledgerUpdate({ eventName: "Trip", collected: 1000, contributors: 1, expenses, link: "L", organizerName: "Ravi", closed: true });
    expect(text).toContain("final accounts");
    expect(text).toContain("from 1 person");
    expect(text).toContain("Shortfall: ₹15,000");
  });
});
