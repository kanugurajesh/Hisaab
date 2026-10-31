import type { Event } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ledgerUpdate } from "@/lib/expenses/ledger";
import { inviteUrl } from "@/lib/links";
import { groupNudge } from "@/lib/reminders/generate";
import { getEventStats } from "./stats";

// WhatsApp messages the organizer copies into the group. Templates, not model
// output, because every name and number in them has to be exact.

export async function groupNudgeFor(event: Event): Promise<string> {
  const missing = await prisma.rosterMember.findMany({ where: { eventId: event.id, status: "PENDING" }, orderBy: { displayName: "asc" } });
  return groupNudge({
    eventName: event.name,
    missing: missing.map((m) => m.displayName),
    link: await inviteUrl(event.inviteCode),
    amount: event.perHeadAmount,
    organizerName: event.organizerName,
  });
}

export async function ledgerUpdateFor(event: Event): Promise<string> {
  const [expenses, stats] = await Promise.all([
    prisma.expense.findMany({ where: { eventId: event.id }, select: { amount: true, category: true, receiptKey: true } }),
    getEventStats(event.id),
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
