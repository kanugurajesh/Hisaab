"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEvent, requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ledgerUpdate } from "@/lib/expenses/ledger";
import { generateReminder, groupNudge, LANGUAGES, toneForAttempt, whatsappLink, type Language, type Tone } from "@/lib/reminders/generate";
import { addExpense as addExpenseService } from "@/lib/services/expenses";
import { runMatching } from "@/lib/services/matching";
import { importRoster as importRosterService, newNudgeToken } from "@/lib/services/roster";
import { getEventStats } from "@/lib/services/stats";
import { deleteObject, deletePrefix } from "@/lib/storage";
import { isValidVpa, normalizeVpa } from "@/lib/upi";
import { InvalidImageError } from "@/lib/verify/image";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
export const inviteUrl = async (code: string, token?: string) => `${appUrl()}/i/${code}${token ? `?r=${token}` : ""}`;

export type FormState = { error?: string; message?: string } | undefined;

const eventInput = z.object({
  name: z.string().trim().min(3, "Give the event a name").max(80),
  date: z.coerce.date({ message: "Pick the event date" }),
  perHeadAmount: z.coerce.number().int().min(1, "Per-head amount must be at least ₹1").max(1_000_000),
  organizerName: z.string().trim().min(2, "Enter the name shown on your UPI account").max(80),
  organizerUpiVpa: z.string().trim().refine(isValidVpa, "Enter a valid UPI ID, e.g. name@okicici"),
  dueDate: z.union([z.literal(""), z.coerce.date()]).optional(),
});

export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireOrganizer();
  const parsed = eventInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { dueDate, organizerUpiVpa, ...rest } = parsed.data;
  const event = await prisma.event.create({
    data: {
      ...rest,
      organizerUpiVpa: normalizeVpa(organizerUpiVpa)!,
      dueDate: dueDate || null,
      organizerId: user.id,
      inviteCode: randomBytes(5).toString("base64url"),
    },
  });
  redirect(`/events/${event.id}`);
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
  const event = await requireEvent(eventId);
  const missing = await prisma.rosterMember.findMany({ where: { eventId, status: "PENDING" }, orderBy: { displayName: "asc" } });
  return groupNudge({
    eventName: event.name,
    missing: missing.map((m) => m.displayName),
    link: await inviteUrl(event.inviteCode),
    amount: event.perHeadAmount,
    organizerName: event.organizerName,
  });
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
  const event = await requireEvent(eventId);
  const [expenses, stats] = await Promise.all([
    prisma.expense.findMany({ where: { eventId }, select: { amount: true, category: true, receiptKey: true } }),
    getEventStats(eventId),
  ]);
  return ledgerUpdate({
    eventName: event.name,
    collected: stats.collected,
    contributors: stats.registrations,
    expenses,
    link: `${await inviteUrl(event.inviteCode)}#ledger`,
    organizerName: event.organizerName,
    closed: event.status === "CLOSED",
  });
}

export async function setEventStatus(eventId: string, status: "OPEN" | "CLOSED") {
  await requireEvent(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { status } });
  revalidatePath(`/events/${eventId}`);
}

export async function deleteEvent(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  const event = await requireEvent(eventId);
  // Once anyone has paid, the collection holds a money record: close (and settle) it first.
  const paid = await prisma.contribution.count({ where: { eventId } });
  if (paid && event.status === "OPEN") return { error: "Close the collection before deleting it." };
  if (String(form.get("confirm") ?? "").trim() !== event.name) return { error: "Type the collection name exactly to confirm." };
  // Contributions, roster, reminders and expenses cascade; AI cost logs are kept with no event.
  await prisma.event.delete({ where: { id: eventId } });
  try {
    await Promise.all([deletePrefix(`proofs/${eventId}/`), deletePrefix(`receipts/${eventId}/`)]);
  } catch (err) {
    console.error("deleteEvent: failed to remove proof screenshots and bills", { eventId, err });
  }
  revalidatePath("/events");
  redirect("/events");
}
