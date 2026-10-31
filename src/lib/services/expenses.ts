import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { extractBill, type BillExtraction } from "@/lib/expenses/extract";
import { evaluateBill, findSimilarExpense, parseBillDate, type BillCheck } from "@/lib/expenses/rules";
import { inr } from "@/lib/format";
import { putObject } from "@/lib/storage";
import { hammingDistance, prepareProofImage } from "@/lib/verify/image";

const NEAR_DUPLICATE_BITS = 6;

// Every field is optional when a bill is attached: whatever the organizer
// leaves blank is read off the bill.
export const expenseInput = z.object({
  title: z.string().trim().min(2, "What was it for?").max(80).optional(),
  amount: z.coerce.number().int("Whole rupees only").positive("Enter the amount").max(10_000_000).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});

export type ExpenseResult = { error?: string; message?: string };

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function addExpense(eventId: string, raw: Record<string, string | undefined>, bill: Buffer | null): Promise<ExpenseResult> {
  // Blank form fields mean "not given", not "".
  const parsed = expenseInput.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v?.trim())));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  if (!bill) {
    if (!input.title) return { error: "What was it for? Or attach the bill and we'll read it." };
    if (!input.amount) return { error: "Enter the amount, or attach the bill." };
    await prisma.expense.create({ data: { eventId, title: input.title, amount: input.amount, category: input.category ?? "Other" } });
    return { message: "Expense added." };
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const image = await prepareProofImage(bill, "bill photo");

  let x: BillExtraction | null = null;
  try {
    x = await extractBill({
      jpeg: image.jpeg,
      eventId,
      mock: () => ({
        isBill: true,
        kind: "printed_bill",
        vendor: input.title ?? "Demo Store",
        items: [],
        tax: null,
        discount: null,
        total: input.amount ?? 100 * (1 + (parseInt(image.sha256.slice(0, 4), 16) % 50)),
        date: istToday(),
        summary: input.title ?? "Event supplies",
        category: input.category ?? "Other",
        readability: "high",
      }),
    });
  } catch {
    // Vision model unavailable: the organizer's own fields still work, flagged as unchecked.
  }

  const amount = input.amount ?? (x?.isBill && x.total !== null ? Math.round(x.total) : undefined);
  const title = input.title ?? (x?.isBill ? (x.summary.trim() || x.vendor?.trim()) : undefined);
  if (!amount || amount <= 0) return { error: "Couldn't read a total on this bill. Enter the amount yourself." };
  if (!title || title.length < 2) return { error: "Couldn't tell what this bill was for. Add a short description." };
  const vendor = x?.vendor?.trim().slice(0, 80) || null;
  const billDate = parseBillDate(x?.date ?? null);

  const others = await prisma.expense.findMany({
    where: { eventId },
    select: { title: true, vendor: true, amount: true, billDate: true, receiptSha256: true, receiptPhash: true },
  });
  const sameReceipt = others.find(
    (o) => o.receiptSha256 === image.sha256 || (o.receiptPhash && hammingDistance(o.receiptPhash, image.dhash) <= NEAR_DUPLICATE_BITS),
  );
  const similar = findSimilarExpense({ title, vendor, amount, billDate }, others);

  let checks: BillCheck[];
  let flagged: boolean;
  if (x) {
    ({ checks, flagged } = evaluateBill({
      extracted: x,
      typedAmount: input.amount ?? null,
      event,
      duplicates: { sameReceipt: sameReceipt?.title ?? null, similarEntry: similar?.title ?? null },
    }));
  } else {
    checks = [{ id: "readable", label: "Bill is legible", pass: false, detail: "The AI couldn't read this bill, so nothing was checked." }];
    flagged = true;
  }

  const receiptKey = `receipts/${eventId}/${randomUUID()}.jpg`;
  await putObject(receiptKey, image.jpeg, "image/jpeg");
  const category = input.category ?? x?.category ?? "Other";
  await prisma.expense.create({
    data: {
      eventId,
      title: title.slice(0, 80),
      amount,
      category,
      vendor,
      billDate,
      receiptKey,
      receiptSha256: image.sha256,
      receiptPhash: image.dhash,
      extracted: x ?? undefined,
      checks: checks as unknown as object[],
      flagged,
    },
  });

  const filled = [!input.title && "description", !input.amount && "amount", !input.category && "category"].filter(Boolean);
  const read = filled.length && x ? ` (${filled.join(", ")} read from the bill)` : "";
  if (!flagged) return { message: `Added "${title}" · ${inr(amount)} · ${category}${read}.` };
  const issues = checks.filter((c) => !c.pass).map((c) => c.detail);
  return { message: `Added "${title}" · ${inr(amount)}${read}. Worth a look: ${issues.join("; ")}.` };
}
