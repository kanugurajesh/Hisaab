import type { RosterStatus, VerificationStatus } from "@prisma/client";
import { summarizeExpenses } from "@/lib/expenses/ledger";
import { inr, shortDate } from "@/lib/format";
import { nameSimilarity } from "@/lib/similarity";
import type { Check } from "@/lib/verify/rules";
import type { Route } from "./route";

// Every sentence, name and number the assistant shows is written here from
// database rows. Pure functions, so they're unit-tested without a model or a DB.

export type Tone = "good" | "warn" | "bad" | "muted";
export interface AnswerItem {
  label: string;
  detail?: string;
  amount?: number;
  badge?: { text: string; tone: Tone };
}
export interface AssistantAnswer {
  text: string;
  items?: AnswerItem[];
  /** A message for the organizer to copy or open in WhatsApp. Nothing is ever sent for them. */
  draft?: { text: string; phone?: string | null; reminderId?: string };
  link?: { href: string; label: string };
}

export interface PaymentRow {
  name: string;
  amount: number;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  utr?: string | null;
  checks?: unknown;
}
export interface MemberRow {
  displayName: string;
  status: RosterStatus;
}
export interface ExpenseRow {
  title: string;
  vendor: string | null;
  amount: number;
  category: string;
  receiptKey: string | null;
}

const STATUS: Record<VerificationStatus, { text: string; tone: Tone }> = {
  VERIFIED: { text: "AI verified", tone: "good" },
  APPROVED: { text: "Approved", tone: "good" },
  NEEDS_REVIEW: { text: "Needs review", tone: "warn" },
  UNVERIFIED: { text: "Unverified", tone: "warn" },
  REJECTED: { text: "Rejected", tone: "bad" },
};
const FILTER_STATUSES: Record<NonNullable<Route["status"]>, VerificationStatus[] | null> = {
  verified: ["VERIFIED", "APPROVED"],
  needs_review: ["NEEDS_REVIEW", "UNVERIFIED"],
  rejected: ["REJECTED"],
  any: null,
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Everyone who best matches a name the organizer typed ("rahul" finds "Rahul Verma"),
 * one row per distinct name, in the given order. More than one means "which Anil?";
 * none means nobody is close. The floor is high on purpose: showing the wrong
 * person's payment is worse than asking again ("Shalini Rao" must not find "Srinivas Rao").
 */
export function closestMatches<T>(name: string, rows: T[], key: (r: T) => string, floor = 0.85): T[] {
  const scored = rows.map((r) => ({ r, s: nameSimilarity(name, key(r)) })).filter((x) => x.s >= floor);
  if (!scored.length) return [];
  const top = Math.max(...scored.map((x) => x.s));
  const seen = new Set<string>();
  return scored.filter((x) => x.s >= top - 0.01 && !seen.has(key(x.r)) && seen.add(key(x.r))).map((x) => x.r);
}

/** "Which one did you mean?", with each option as a follow-up question the organizer can tap. */
export function whichOne(names: string[], ask: (name: string) => string): AssistantAnswer {
  return { text: `More than one person matches. Which one did you mean?`, items: names.map((n) => ({ label: ask(n) })) };
}

export function summaryAnswer(s: {
  expected: number;
  paid: number;
  suggested: number;
  missing: number;
  registrations: number;
  collected: number;
  spent: number;
  balance: number;
  needsReview: number;
}): AssistantAnswer {
  const parts = [`${inr(s.collected)} collected from ${plural(s.registrations, "person", "people")}.`];
  if (s.expected) {
    parts.push(
      `${s.paid} of ${s.expected} group members have paid${s.suggested ? `, ${s.suggested} more likely paid (confirm them)` : ""}, ${s.missing} still to pay.`,
    );
  }
  if (s.needsReview) parts.push(`${plural(s.needsReview, "payment")} waiting for your review.`);
  parts.push(`${inr(s.spent)} spent, ${s.balance >= 0 ? `${inr(s.balance)} in hand` : `${inr(-s.balance)} short`}.`);
  return { text: parts.join(" ") };
}

export function unpaidAnswer(members: MemberRow[]): AssistantAnswer {
  const pending = members.filter((m) => m.status === "PENDING");
  const likely = members.filter((m) => m.status === "SUGGESTED");
  if (!pending.length && !likely.length) {
    return members.length
      ? { text: "Everyone on your group list has paid. 🎉" }
      : { text: "Import your WhatsApp group first, so I know who should pay.", link: { href: "?tab=roster", label: "Import the group" } };
  }
  return {
    text:
      `${plural(pending.length, "person", "people")} ${pending.length === 1 ? "hasn't" : "haven't"} paid yet` +
      (likely.length ? `, and ${likely.length} probably paid under a different name (confirm them on the list).` : "."),
    items: [
      ...pending.map((m) => ({ label: m.displayName, badge: { text: "Not paid", tone: "warn" as const } })),
      ...likely.map((m) => ({ label: m.displayName, badge: { text: "Likely paid", tone: "muted" as const } })),
    ],
    link: { href: "?tab=roster", label: "Open Who hasn't paid" },
  };
}

export function filterPayments(rows: PaymentRow[], r: Pick<Route, "status" | "minAmount" | "maxAmount">): PaymentRow[] {
  const statuses = r.status ? FILTER_STATUSES[r.status] : null;
  return rows.filter(
    (p) =>
      (!statuses || statuses.includes(p.verificationStatus)) &&
      (r.minAmount === null || p.amount >= r.minAmount) &&
      (r.maxAmount === null || p.amount <= r.maxAmount),
  );
}

function describeFilter(r: Pick<Route, "status" | "minAmount" | "maxAmount">): string {
  const status = { verified: " verified", needs_review: " waiting for review", rejected: " rejected", any: "" }[r.status ?? "any"];
  const amount =
    r.minAmount !== null && r.maxAmount !== null
      ? ` between ${inr(r.minAmount)} and ${inr(r.maxAmount)}`
      : r.minAmount !== null
        ? ` of ${inr(r.minAmount)} or more`
        : r.maxAmount !== null
          ? ` of ${inr(r.maxAmount)} or less`
          : "";
  return `${status}${amount}`;
}

export function paymentsAnswer(rows: PaymentRow[], r: Pick<Route, "status" | "minAmount" | "maxAmount">): AssistantAnswer {
  const list = filterPayments(rows, r).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const what = describeFilter(r);
  const link = { href: "?tab=review", label: "Open Payments" };
  if (!list.length) return { text: `No payments${what}.`, link };
  const total = list.reduce((sum, p) => sum + p.amount, 0);
  return {
    text: `${plural(list.length, "payment")}${what}, ${inr(total)} in total.`,
    items: list.map((p) => ({ label: p.name, detail: shortDate(p.createdAt), amount: p.amount, badge: STATUS[p.verificationStatus] })),
    link,
  };
}

export function paymentDetailAnswer(asked: string, payment: PaymentRow | null, member: MemberRow | null): AssistantAnswer {
  if (!payment) {
    if (member?.status === "PENDING") return { text: `${member.displayName} hasn't paid yet: no registration in their name.`, link: { href: "?tab=roster", label: "Open Who hasn't paid" } };
    if (member) return { text: `${member.displayName} is on your group list, but I couldn't find a payment registered in that name.` };
    return { text: `I couldn't find anyone called "${asked}" in this collection.` };
  }
  const status = STATUS[payment.verificationStatus];
  const failed = ((payment.checks as Check[] | null) ?? []).filter((c) => !c.pass);
  const why =
    payment.verificationStatus === "NEEDS_REVIEW"
      ? ` It failed ${plural(failed.length, "check")}, listed below. Approve or reject it in Payments.`
      : payment.verificationStatus === "UNVERIFIED"
        ? " The screenshot couldn't be read, so it's waiting for you in Payments."
        : payment.verificationStatus === "VERIFIED"
          ? " Every check on the screenshot passed."
          : "";
  return {
    text: `${payment.name} registered ${inr(payment.amount)} on ${shortDate(payment.createdAt)}${payment.utr ? ` (UPI ref ${payment.utr})` : ""}. Status: ${status.text}.${why}`,
    items: failed.map((c) => ({ label: c.label, detail: c.detail, badge: { text: "Failed", tone: "bad" as const } })),
    link: { href: "?tab=review", label: "Open Payments" },
  };
}

export function spendingAnswer(expenses: ExpenseRow[], category: string | null): AssistantAnswer {
  const link = { href: "?tab=expenses", label: "Open Expenses" };
  if (category) {
    const list = expenses.filter((e) => e.category === category);
    if (!list.length) return { text: `Nothing spent on ${category} yet.`, link };
    const total = list.reduce((s, e) => s + e.amount, 0);
    return {
      text: `${inr(total)} spent on ${category} across ${plural(list.length, "expense")}.`,
      items: list.map((e) => ({ label: e.title, detail: [e.vendor, e.receiptKey ? "bill attached" : "no bill"].filter(Boolean).join(" · "), amount: e.amount })),
      link,
    };
  }
  if (!expenses.length) return { text: "No expenses logged yet.", link };
  const { total, byCategory, billCoverage } = summarizeExpenses(expenses);
  return {
    text: `${inr(total)} spent so far across ${plural(expenses.length, "expense")}${billCoverage !== null ? `, ${Math.round(billCoverage * 100)}% of it backed by bills` : ""}.`,
    items: byCategory.map(([cat, amt]) => ({ label: cat, amount: amt })),
    link,
  };
}

export function groupReminderAnswer(draft: string, pendingCount: number): AssistantAnswer {
  if (!pendingCount) return { text: "Nobody on your group list is unpaid, so there's no one to remind." };
  return { text: `Here's a reminder for the group naming the ${plural(pendingCount, "person", "people")} who haven't paid. Nothing is sent until you send it.`, draft: { text: draft } };
}

export const HELP: AssistantAnswer = {
  text: "I answer from this collection's data and draft messages for you to send. Try one of these:",
  items: [
    { label: "Who hasn't paid yet?" },
    { label: "Which payments need my review?" },
    { label: "Who paid less than ₹500?" },
    { label: "Why was Rahul flagged?" },
    { label: "How much did we spend on food?" },
    { label: "Remind Anil in Telugu" },
    { label: "Write the money update for the group" },
  ],
};
