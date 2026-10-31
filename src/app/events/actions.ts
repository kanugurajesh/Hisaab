"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEvent, requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchesName } from "@/lib/format";
import { inviteUrl } from "@/lib/links";
import { generateReminder, LANGUAGES, toneForAttempt, whatsappLink, type Language, type Tone } from "@/lib/reminders/generate";
import { addExpense as addExpenseService } from "@/lib/services/expenses";
import { runMatching } from "@/lib/services/matching";
import { importRoster as importRosterService, newNudgeToken } from "@/lib/services/roster";
import { groupNudgeFor, ledgerUpdateFor } from "@/lib/services/drafts";
import { createNextMonth, monthName, newInviteCode } from "@/lib/services/funds";
import { periodOf } from "@/lib/funds/months";
import { deleteObject, deletePrefix } from "@/lib/storage";
import { isValidVpa, normalizeVpa } from "@/lib/upi";
import { InvalidImageError } from "@/lib/verify/image";


export type FormState = { error?: string; message?: string } | undefined;

// What contributors see once they've paid. All optional; blank clears.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const detailsShape = {
  startTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time")]).optional().transform((v) => v || null),
  venue: optionalText(200),
  notes: optionalText(500),
};

const eventInput = z.object({
  name: z.string().trim().min(3, "Give the event a name").max(80),
  date: z.coerce.date({ message: "Pick the event date" }),
  perHeadAmount: z.coerce.number().int().min(1, "Per-head amount must be at least ₹1").max(1_000_000),
  organizerName: z.string().trim().min(2, "Enter the name shown on your UPI account").max(80),
  organizerUpiVpa: z.string().trim().refine(isValidVpa, "Enter a valid UPI ID, e.g. name@okicici"),
  dueDate: z.union([z.literal(""), z.coerce.date()]).optional(),
  ...detailsShape,
});

export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireOrganizer();
  const parsed = eventInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { dueDate, organizerUpiVpa, ...rest } = parsed.data;
  // A monthly fund: this is its first month, and "Start next month" continues it.
  const monthly = form.get("monthly") === "on";
  const period = periodOf(rest.date);
  // One transaction, so a failed first month doesn't leave an empty fund behind.
  const event = await prisma.$transaction(async (tx) => {
    const fund = monthly ? await tx.fund.create({ data: { name: rest.name, organizerId: user.id } }) : null;
    return tx.event.create({
      data: {
        ...rest,
        ...(fund && { fundId: fund.id, period, name: monthName(fund.name, period) }),
        organizerUpiVpa: normalizeVpa(organizerUpiVpa)!,
        dueDate: dueDate || null,
        organizerId: user.id,
        inviteCode: newInviteCode(),
      },
    });
  });
  redirect(`/events/${event.id}`);
}

/** Next month of a monthly fund, with the same people, all unpaid. */
export async function startNextMonth(eventId: string) {
  const event = await requireEvent(eventId);
  const month = await createNextMonth(event);
  revalidatePath("/events");
  if (event.fundId) revalidatePath(`/funds/${event.fundId}`);
  redirect(`/events/${month.id}?tab=roster`);
}

export async function updateEventDetails(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireEvent(eventId);
  const parsed = z.object(detailsShape).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.event.update({ where: { id: eventId }, data: parsed.data });
  revalidatePath(`/events/${eventId}`);
  return { message: "Saved. Contributors see this once their payment is confirmed." };
}

export async function importRoster(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireEvent(eventId);
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) return { error: "Chat export must be under 5 MB." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Paste the member list or upload a WhatsApp chat export (.txt)." };
  const res = await importRosterService(eventId, text);
  revalidatePath(`/events/${eventId}`);
  if (!res.added) return { message: `Found ${res.found} people — all were already on the roster.` };
  const parts = [`Added ${res.added} people`];
  if (res.excluded) parts.push(`${res.excluded} auto-excluded (organizer/businesses)`);
  if (res.leftGroup) parts.push(`${res.leftGroup} skipped because they left the group`);
  if (res.matched || res.suggested) parts.push(`${res.matched} already paid, ${res.suggested} likely paid`);
  return { message: `${parts.join(" · ")}.` };
}

export async function addRosterMember(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireEvent(eventId);
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter a name." };
  const { normalizePhone } = await import("@/lib/phone");
  await prisma.rosterMember.create({
    data: { eventId, displayName: name, phone: normalizePhone(String(form.get("phone") ?? "")), source: "MANUAL", nudgeToken: newNudgeToken() },
  });
  await runMatching(eventId);
  revalidatePath(`/events/${eventId}`);
  return { message: `Added ${name}.` };
}

async function ownedMember(rosterId: string) {
  const member = await prisma.rosterMember.findUniqueOrThrow({ where: { id: rosterId }, include: { event: true } });
  await requireEvent(member.eventId);
  return member;
}

export async function setExcluded(rosterId: string, excluded: boolean) {
  const m = await ownedMember(rosterId);
  await prisma.rosterMember.update({
    where: { id: rosterId },
    data: excluded
      ? { status: "EXCLUDED", contributionId: null, matchReason: "Excluded by organizer" }
      : { status: "PENDING", matchReason: null },
  });
  if (!excluded) await runMatching(m.eventId);
  revalidatePath(`/events/${m.eventId}`);
}

export async function resolveSuggestion(rosterId: string, accept: boolean) {
  const m = await ownedMember(rosterId);
  await prisma.rosterMember.update({
    where: { id: rosterId },
    data: accept
      ? { status: "MATCHED", matchConfidence: 1, matchReason: `${m.matchReason ?? "Suggested"} · confirmed by organizer` }
      : { status: "PENDING", contributionId: null, matchConfidence: null, matchReason: null },
  });
  revalidatePath(`/events/${m.eventId}`);
}

export async function draftReminder(rosterId: string, language: Language, tone?: Tone) {
  const m = await ownedMember(rosterId);
  if (!(language in LANGUAGES)) throw new Error("unsupported language");
  const attempt = (await prisma.reminder.count({ where: { rosterMemberId: rosterId, sentAt: { not: null } } })) + 1;
  const link = await inviteUrl(m.event.inviteCode, m.nudgeToken);
  const finalTone = tone ?? toneForAttempt(attempt);
  const { message, usedFallback } = await generateReminder(
    {
      // Phone-only members have no name to greet; drop "(302)"-style flat numbers.
      name: m.displayName.startsWith("+") ? "there" : m.displayName.replace(/\s*\(.*\)$/, ""),
      eventName: m.event.name,
      amount: m.event.perHeadAmount,
      dueDate: m.event.dueDate,
      link,
      organizerName: m.event.organizerName,
      language,
      tone: finalTone,
    },
    m.eventId,
  );
  const reminder = await prisma.reminder.create({
    data: { rosterMemberId: rosterId, language, tone: finalTone, message, attempt, usedFallback },
  });
  return { reminderId: reminder.id, message, tone: finalTone, attempt, usedFallback, phone: m.phone };
}

/** Called when the organizer taps "Open WhatsApp"; the edited text is what was actually sent. */
export async function markReminderSent(reminderId: string, message: string) {
  const r = await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId }, include: { rosterMember: true } });
  await requireEvent(r.rosterMember.eventId);
  await prisma.reminder.update({ where: { id: reminderId }, data: { sentAt: new Date(), message: message.slice(0, 1000) } });
  revalidatePath(`/events/${r.rosterMember.eventId}`);
  return whatsappLink(r.rosterMember.phone, message);
}

export async function draftGroupNudge(eventId: string) {
  return groupNudgeFor(await requireEvent(eventId));
}

export async function reviewContribution(contributionId: string, approve: boolean) {
  const c = await prisma.contribution.findUniqueOrThrow({ where: { id: contributionId } });
  await requireEvent(c.eventId);
  await prisma.contribution.update({
    where: { id: contributionId },
    data: { verificationStatus: approve ? "APPROVED" : "REJECTED", reviewedAt: new Date() },
  });
  if (!approve) {
    // A rejected payment no longer counts: put the person back on the missing list.
    await prisma.rosterMember.updateMany({
      where: { contributionId },
      data: { status: "PENDING", contributionId: null, matchConfidence: null, matchReason: "Payment rejected by organizer" },
    });
  } else {
    await runMatching(c.eventId);
  }
  revalidatePath(`/events/${c.eventId}`);
}

export async function addExpense(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireEvent(eventId);
  const file = form.get("bill");
  const bill = file instanceof File && file.size ? Buffer.from(await file.arrayBuffer()) : null;
  const str = (k: string) => (form.get(k) as string | null) ?? undefined;
  let res: FormState;
  try {
    res = await addExpenseService(eventId, { title: str("title"), amount: str("amount"), category: str("category") }, bill);
  } catch (err) {
    if (err instanceof InvalidImageError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/events/${eventId}`);
  return res;
}

async function ownedExpense(expenseId: string) {
  const e = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId } });
  await requireEvent(e.eventId);
  return e;
}

/** The organizer looked at a flagged bill and is happy with it. */
export async function clearExpenseFlag(expenseId: string) {
  const e = await ownedExpense(expenseId);
  await prisma.expense.update({ where: { id: expenseId }, data: { flagged: false } });
  revalidatePath(`/events/${e.eventId}`);
}

export async function deleteExpense(expenseId: string) {
  const e = await ownedExpense(expenseId);
  await prisma.expense.delete({ where: { id: expenseId } });
  if (e.receiptKey) await deleteObject(e.receiptKey).catch((err) => console.error("deleteExpense: failed to remove bill", { expenseId, err }));
  revalidatePath(`/events/${e.eventId}`);
}

export async function draftLedgerUpdate(eventId: string) {
  return ledgerUpdateFor(await requireEvent(eventId));
}

export async function setEventStatus(eventId: string, status: "OPEN" | "CLOSED") {
  await requireEvent(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { status } });
  revalidatePath(`/events/${eventId}`);
}

export async function deleteEvent(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  const event = await requireEvent(eventId);
  // Once anyone has paid, the collection holds a money record: close (and settle) it first.
  const [paid, bills] = await Promise.all([prisma.contribution.count({ where: { eventId } }), prisma.expense.count({ where: { eventId } })]);
  // A fund month's payments and bills are part of the fund's shared ledger: deleting would rewrite it.
  if (event.fundId && (paid || bills)) return { error: "This month has payments or bills that belong to the fund, so it can't be deleted." };
  if (paid && event.status === "OPEN") return { error: "Close the collection before deleting it." };
  if (!matchesName(String(form.get("confirm") ?? ""), event.name)) return { error: "Type the collection name to confirm." };
  // Contributions, roster, reminders and expenses cascade; AI cost logs are kept with no event.
  await prisma.event.delete({ where: { id: eventId } });
  // The last month of a fund takes the (now empty) fund with it.
  if (event.fundId) await prisma.fund.deleteMany({ where: { id: event.fundId, months: { none: {} } } });
  try {
    await Promise.all([deletePrefix(`proofs/${eventId}/`), deletePrefix(`receipts/${eventId}/`)]);
  } catch (err) {
    console.error("deleteEvent: failed to remove proof screenshots and bills", { eventId, err });
  }
  revalidatePath("/events");
  redirect("/events");
}
