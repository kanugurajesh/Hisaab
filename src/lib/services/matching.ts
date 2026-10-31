import { prisma } from "@/lib/db";
import { matchRoster } from "@/lib/roster/match";

type Extracted = { payerName?: string | null } | null;

/** Re-match every still-pending roster member against unclaimed registrations. */
export async function runMatching(eventId: string): Promise<{ matched: number; suggested: number }> {
  const [roster, contributions] = await Promise.all([
    prisma.rosterMember.findMany({ where: { eventId, status: "PENDING" } }),
    prisma.contribution.findMany({ where: { eventId, rosterMember: null, verificationStatus: { not: "REJECTED" } } }),
  ]);
  if (!roster.length || !contributions.length) return { matched: 0, suggested: 0 };

  const decisions = await matchRoster(
    roster.map((r) => ({ id: r.id, displayName: r.displayName, phone: r.phone })),
    contributions.map((c) => ({ id: c.id, name: c.name, phone: c.phone, payerName: (c.extracted as Extracted)?.payerName ?? null })),
    eventId,
  );

  for (const d of decisions) {
    // updateMany with the status guard keeps concurrent runs from double-assigning.
    await prisma.rosterMember
      .updateMany({
        where: { id: d.rosterId, status: "PENDING", contributionId: null },
        data: { status: d.status, contributionId: d.contributionId, matchConfidence: d.confidence, matchReason: d.reason },
      })
      .catch(() => undefined); // unique(contributionId) lost a race: leave pending
  }
  return {
    matched: decisions.filter((d) => d.status === "MATCHED").length,
    suggested: decisions.filter((d) => d.status === "SUGGESTED").length,
  };
}
