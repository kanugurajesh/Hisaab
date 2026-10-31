import { describe, expect, it } from "vitest";
import {
  closestMatches,
  filterPayments,
  paymentDetailAnswer,
  paymentsAnswer,
  spendingAnswer,
  summaryAnswer,
  unpaidAnswer,
  type PaymentRow,
} from "@/lib/assistant/answers";
import { routeByKeywords, routeSchema } from "@/lib/assistant/route";

describe("keyword routing (mock mode and fallback)", () => {
  const cases: [string, string, Record<string, unknown>?][] = [
    ["Who hasn't paid yet?", "unpaid"],
    ["kaun bacha hai pay karne", "unpaid"],
    ["Which payments need my review?", "payments", { status: "needs_review" }],
    ["Who paid less than ₹500?", "payments", { maxAmount: 499 }],
    ["payments over 1000", "payments", { minAmount: 1001 }],
    ["Why was Rahul flagged?", "payment_detail", { name: "Rahul" }],
    ["has Anil Varma paid", "payment_detail", { name: "Anil Varma" }],
    ["How much did we spend on food?", "spending", { category: "Food" }],
    ["spnd so far", "spending", { category: null }],
    ["Remind everyone who hasn't paid", "group_reminder"],
    ["remind Anil in Telugu", "personal_reminder", { name: "Anil", language: "te" }],
    ["Write the money update for the group", "money_update"],
    ["how are we doing overall", "summary"],
    ["hello", "help"],
  ];
  it.each(cases)("%s -> %s", (q, tool, args = {}) => {
    const r = routeByKeywords(q);
    expect(r.tool).toBe(tool);
    expect(r).toMatchObject(args);
    expect(routeSchema.zod.safeParse(r).success).toBe(true);
  });
});

const day = new Date("2026-10-30T10:00:00Z");
const pay = (name: string, amount: number, verificationStatus: PaymentRow["verificationStatus"], checks?: unknown): PaymentRow => ({
  name,
  amount,
  verificationStatus,
  createdAt: day,
  checks,
});
const PAYMENTS = [pay("Sita Reddy", 500, "VERIFIED"), pay("Rahul Verma", 300, "NEEDS_REVIEW"), pay("Kiran", 500, "REJECTED"), pay("Anil Varma", 1000, "APPROVED")];
const NONE = { status: null, minAmount: null, maxAmount: null };

describe("answers come from the data", () => {
  it("filters payments by status and amount", () => {
    expect(filterPayments(PAYMENTS, { ...NONE, status: "verified" }).map((p) => p.name)).toEqual(["Sita Reddy", "Anil Varma"]);
    expect(filterPayments(PAYMENTS, { ...NONE, maxAmount: 499 }).map((p) => p.name)).toEqual(["Rahul Verma"]);
    const a = paymentsAnswer(PAYMENTS, { ...NONE, minAmount: 500 });
    expect(a.text).toBe("3 payments of ₹500 or more, ₹2,000 in total.");
    expect(paymentsAnswer(PAYMENTS, { ...NONE, status: "rejected", minAmount: 900 }).text).toBe("No payments rejected of ₹900 or more.");
  });

  it("explains a flagged payment with its failed checks", () => {
    const checks = [
      { id: "amount_matches", label: "Amount matches what they entered", pass: false, detail: "Screenshot ₹500, entered ₹300" },
      { id: "readable", label: "Screenshot is legible", pass: true, detail: "ok" },
    ];
    const [rahul] = closestMatches("rahul", [...PAYMENTS.slice(0, 1), pay("Rahul Verma", 300, "NEEDS_REVIEW", checks)], (p) => p.name);
    const a = paymentDetailAnswer("rahul", rahul, null);
    expect(a.text).toContain("Rahul Verma registered ₹300");
    expect(a.text).toContain("failed 1 check");
    expect(a.items).toEqual([{ label: "Amount matches what they entered", detail: "Screenshot ₹500, entered ₹300", badge: { text: "Failed", tone: "bad" } }]);
    expect(paymentDetailAnswer("Zara", null, null).text).toContain(`couldn't find anyone called "Zara"`);
    expect(paymentDetailAnswer("anil", null, { displayName: "Anil Varma", status: "PENDING" }).text).toBe("Anil Varma hasn't paid yet: no registration in their name.");
  });

  it("never guesses between people", () => {
    const people = [{ n: "Srinivas Rao" }, { n: "Anil Varma" }, { n: "Anil Kumar" }, { n: "Kiran" }, { n: "Kiran" }];
    expect(closestMatches("Shalini Rao", people, (x) => x.n)).toEqual([]);
    expect(closestMatches("anil", people, (x) => x.n).map((x) => x.n)).toEqual(["Anil Varma", "Anil Kumar"]);
    // Two registrations under one name are one person.
    expect(closestMatches("kiran", people, (x) => x.n)).toHaveLength(1);
  });

  it("lists who hasn't paid, with likely matches", () => {
    const a = unpaidAnswer([
      { displayName: "Anil Varma", status: "PENDING" },
      { displayName: "Lakshmi Iyer", status: "SUGGESTED" },
      { displayName: "Sita Reddy", status: "MATCHED" },
    ]);
    expect(a.text).toBe("1 person hasn't paid yet, and 1 probably paid under a different name (confirm them on the list).");
    expect(a.items?.map((i) => i.label)).toEqual(["Anil Varma", "Lakshmi Iyer"]);
    expect(unpaidAnswer([{ displayName: "Sita", status: "MATCHED" }]).text).toContain("Everyone");
    expect(unpaidAnswer([]).link?.href).toBe("?tab=roster");
  });

  it("summarises money in and out", () => {
    const a = summaryAnswer({ expected: 10, paid: 6, suggested: 1, missing: 3, registrations: 7, collected: 3500, spent: 4000, balance: -500, needsReview: 1 });
    expect(a.text).toBe(
      "₹3,500 collected from 7 people. 6 of 10 group members have paid, 1 more likely paid (confirm them), 3 still to pay. 1 payment waiting for your review. ₹4,000 spent, ₹500 short.",
    );
  });

  it("totals spending overall and per category", () => {
    const expenses = [
      { title: "Sweets", vendor: "Anand", amount: 1200, category: "Food", receiptKey: "k1" },
      { title: "Dinner", vendor: null, amount: 800, category: "Food", receiptKey: null },
      { title: "Diyas", vendor: null, amount: 500, category: "Decoration", receiptKey: "k2" },
    ];
    expect(spendingAnswer(expenses, "Food").text).toBe("₹2,000 spent on Food across 2 expenses.");
    expect(spendingAnswer(expenses, null).text).toBe("₹2,500 spent so far across 3 expenses, 68% of it backed by bills.");
    expect(spendingAnswer(expenses, "Travel").text).toBe("Nothing spent on Travel yet.");
  });
});
