import { inr } from "@/lib/format";

export interface LedgerExpense {
  amount: number;
  category: string;
  receiptKey: string | null;
}

export function summarizeExpenses(expenses: LedgerExpense[]) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const withBill = expenses.filter((e) => e.receiptKey).reduce((s, e) => s + e.amount, 0);
  return {
    total,
    byCategory: [...byCategory].sort((a, b) => b[1] - a[1]),
    /** Share of the money spent that has a bill anyone in the group can open. */
    billCoverage: total ? withBill / total : null,
  };
}

/** Money update for the WhatsApp group. A template on purpose: every number must be exact. */
export function ledgerUpdate(opts: {
  eventName: string;
  collected: number;
  contributors: number;
  expenses: LedgerExpense[];
  link: string;
  organizerName: string;
  closed: boolean;
}): string {
  const { total, byCategory, billCoverage } = summarizeExpenses(opts.expenses);
  const balance = opts.collected - total;
  const lines = [
    `📒 ${opts.eventName}: ${opts.closed ? "final accounts" : "money update"}`,
    `Collected: ${inr(opts.collected)} from ${opts.contributors} ${opts.contributors === 1 ? "person" : "people"}`,
    `Spent: ${inr(total)}`,
    ...byCategory.slice(0, 6).map(([cat, amt]) => `  • ${cat}: ${inr(amt)}`),
    ...(byCategory.length > 6 ? [`  • ${byCategory.length - 6} more categories: ${inr(byCategory.slice(6).reduce((s, [, a]) => s + a, 0))}`] : []),
    balance >= 0 ? `Balance in hand: ${inr(balance)}` : `Shortfall: ${inr(-balance)}`,
    "",
    billCoverage !== null && billCoverage > 0
      ? `Every expense${billCoverage < 1 ? ` (bills for ${Math.round(billCoverage * 100)}% of spend)` : " and its bill"} is here: ${opts.link}`
      : `Full list of expenses: ${opts.link}`,
    `— ${opts.organizerName}`,
  ];
  return lines.join("\n");
}
