import { prisma } from "@/lib/db";

export async function getEventStats(eventId: string) {
  const [event, roster, contributions, expenses] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.rosterMember.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    prisma.contribution.findMany({ where: { eventId }, select: { amount: true, verificationStatus: true } }),
    prisma.expense.aggregate({ where: { eventId }, _sum: { amount: true } }),
  ]);
  const count = (s: string) => roster.find((r) => r.status === s)?._count ?? 0;
  const matched = count("MATCHED");
  const suggested = count("SUGGESTED");
  const pending = count("PENDING");
  const expected = matched + suggested + pending;
  const counted = contributions.filter((c) => c.verificationStatus !== "REJECTED");
  const collected = counted.reduce((sum, c) => sum + c.amount, 0);
  const spent = expenses._sum.amount ?? 0;
  return {
    expected,
    paid: matched,
    suggested,
    missing: pending,
    registrations: counted.length,
    collected,
    expectedAmount: expected * event.perHeadAmount,
    spent,
    balance: collected - spent,
    collectionRate: expected ? matched / expected : null,
    needsReview: contributions.filter((c) => c.verificationStatus === "NEEDS_REVIEW" || c.verificationStatus === "UNVERIFIED").length,
    verified: contributions.filter((c) => c.verificationStatus === "VERIFIED" || c.verificationStatus === "APPROVED").length,
  };
}

export async function getReminderFunnel(eventId: string) {
  const reminders = await prisma.reminder.findMany({
    where: { rosterMember: { eventId }, sentAt: { not: null } },
    select: { rosterMemberId: true, rosterMember: { select: { status: true } } },
  });
  const nudged = new Map(reminders.map((r) => [r.rosterMemberId, r.rosterMember.status]));
  const converted = [...nudged.values()].filter((s) => s === "MATCHED" || s === "SUGGESTED").length;
  return { sent: reminders.length, peopleNudged: nudged.size, converted };
}
