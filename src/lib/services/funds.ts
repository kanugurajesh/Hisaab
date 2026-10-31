import { randomBytes } from "node:crypto";
import { Prisma, type Event, type Fund, type RosterMember } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addMonths, buildFundGrid, monthLabel, nextPeriod, periodOf } from "@/lib/funds/months";
import { newNudgeToken } from "./roster";

/** "Sai Nagar Ganesh Fund · Nov 2026" */
export const monthName = (fundName: string, period: string) => `${fundName} · ${monthLabel(period)}`;

export const newInviteCode = () => randomBytes(5).toString("base64url");

/**
 * The fund's months with their rosters and payments, as the person × month
 * grid. `upTo` and `people` (personKeys) narrow it for a single month's view.
 */
export async function loadFundGrid(fundId: string, now = new Date(), only: { upTo?: string; people?: string[] } = {}) {
  const months = await prisma.event.findMany({
    where: { fundId, ...(only.upTo && { period: { lte: only.upTo } }) },
    orderBy: { period: "asc" },
    include: {
      roster: {
        // A person's first-month row has no personKey: its own id is the key.
        ...(only.people && { where: { OR: [{ personKey: { in: only.people } }, { id: { in: only.people } }] } }),
        select: {
          id: true,
          personKey: true,
          displayName: true,
          phone: true,
          status: true,
          contribution: { select: { amount: true, verificationStatus: true } },
        },
      },
    },
  });
  const grid = buildFundGrid(
    months.map((m) => ({ id: m.id, period: m.period!, status: m.status, roster: m.roster })),
    now,
  );
  return { ...grid, events: months };
}

/**
 * The fund's money across every month: what the group sees. A monthly fund
 * collects all year and spends at festival time, so a single month's numbers
 * would show a huge "shortfall" in September and a "surplus" every other month.
 */
export async function getFundLedger(fundId: string, year = periodOf(new Date()).slice(0, 4)) {
  const [payments, expenses] = await Promise.all([
    prisma.contribution.findMany({
      where: { event: { fundId }, verificationStatus: { not: "REJECTED" } },
      select: { amount: true, event: { select: { period: true } } },
    }),
    prisma.expense.findMany({
      where: { event: { fundId } },
      orderBy: [{ billDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
  ]);
  const sum = (ps: typeof payments) => ps.reduce((s, p) => s + p.amount, 0);
  return {
    collected: sum(payments),
    collectedInYear: sum(payments.filter((p) => p.event.period?.startsWith(year))),
    payments: payments.length,
    expenses,
  };
}

/**
 * Next month of a fund: same amount, UPI ID and details, same people. Members
 * keep their personKey so the fund page can follow them across months;
 * everyone starts the month unpaid, except people the organizer excluded.
 */
export async function createNextMonth(event: Event): Promise<Event> {
  if (!event.fundId || !event.period) throw new Error("Not a month of a fund");
  const fund = await prisma.fund.findUniqueOrThrow({ where: { id: event.fundId } });
  const latest = await prisma.event.findFirstOrThrow({ where: { fundId: fund.id }, orderBy: { period: "desc" } });
  const period = nextPeriod(latest.period!);
  const existing = await prisma.event.findUnique({ where: { fundId_period: { fundId: fund.id, period } } });
  if (existing) return existing;

  const roster = await prisma.rosterMember.findMany({ where: { eventId: latest.id }, orderBy: { createdAt: "asc" } });
  try {
    return await copyMonth(fund, latest, period, roster);
  } catch (err) {
    // A double submit or a second tab got there first: go to the month it made.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const made = await prisma.event.findUnique({ where: { fundId_period: { fundId: fund.id, period } } });
      if (made) return made;
    }
    throw err;
  }
}

function copyMonth(fund: Fund, latest: Event, period: string, roster: RosterMember[]): Promise<Event> {
  return prisma.$transaction(async (tx) => {
    const month = await tx.event.create({
      data: {
        organizerId: latest.organizerId,
        fundId: fund.id,
        period,
        name: monthName(fund.name, period),
        date: addMonths(latest.date, 1),
        dueDate: latest.dueDate ? addMonths(latest.dueDate, 1) : null,
        perHeadAmount: latest.perHeadAmount,
        organizerName: latest.organizerName,
        organizerUpiVpa: latest.organizerUpiVpa,
        startTime: latest.startTime,
        venue: latest.venue,
        inviteCode: newInviteCode(),
      },
    });
    await tx.rosterMember.createMany({
      data: roster.map((r) => ({
        eventId: month.id,
        displayName: r.displayName,
        phone: r.phone,
        personKey: r.personKey ?? r.id,
        source: r.source,
        status: r.status === "EXCLUDED" ? "EXCLUDED" : "PENDING",
        matchReason: r.status === "EXCLUDED" ? r.matchReason : null,
        nudgeToken: newNudgeToken(),
      })),
    });
    return month;
  });
}
