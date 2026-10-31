import { randomBytes } from "node:crypto";
import { Prisma, type Event, type Fund, type RosterMember } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addMonths, buildFundGrid, canStartNextMonth, monthLabel, monthsBetween, nextPeriod, periodOf } from "@/lib/funds/months";
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
 * The fund's money across every month, summed in the database. A monthly fund
 * collects all year and spends at festival time, so a single month's numbers
 * would show a huge "shortfall" in September and a "surplus" every other month.
 */
export async function getFundTotals(fundId: string, year = periodOf(new Date()).slice(0, 4)) {
  const [months, byMonth, spent] = await Promise.all([
    prisma.event.findMany({ where: { fundId }, select: { id: true, period: true } }),
    prisma.contribution.groupBy({
      by: ["eventId"],
      where: { event: { fundId }, verificationStatus: { not: "REJECTED" } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.aggregate({ where: { event: { fundId } }, _sum: { amount: true } }),
  ]);
  const inYear = new Set(months.filter((m) => m.period?.startsWith(year)).map((m) => m.id));
  const total = (rows: typeof byMonth) => rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const collected = total(byMonth);
  const totalSpent = spent._sum.amount ?? 0;
  return {
    collected,
    collectedInYear: total(byMonth.filter((r) => inYear.has(r.eventId))),
    payments: byMonth.reduce((s, r) => s + r._count, 0),
    spent: totalSpent,
    balance: collected - totalSpent,
  };
}

/** The fund's totals plus every expense, newest bill first: what the group sees. */
export async function getFundLedger(fundId: string, year?: string) {
  const [totals, expenses] = await Promise.all([
    getFundTotals(fundId, year),
    prisma.expense.findMany({
      where: { event: { fundId } },
      orderBy: [{ billDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
  ]);
  return { ...totals, expenses };
}

/**
 * The month after `event`: same amount, UPI ID and details, same people.
 * Members keep their personKey so the fund page can follow them across months;
 * everyone starts the month unpaid, except people the organizer excluded.
 *
 * Asking twice gives the same month, whether the requests overlap or not, and
 * a month can only be opened once the one before it has begun, so repeated
 * clicks can't stack up future months.
 */
export async function createNextMonth(event: Event, now = new Date()): Promise<Event> {
  if (!event.fundId || !event.period) throw new Error("Not a month of a fund");
  const fundId = event.fundId;
  const period = nextPeriod(event.period);
  const find = () => prisma.event.findUnique({ where: { fundId_period: { fundId, period } } });
  const existing = await find();
  if (existing) return existing;
  if (!canStartNextMonth(event.period, now)) return event;

  const [fund, first, roster] = await Promise.all([
    prisma.fund.findUniqueOrThrow({ where: { id: fundId } }),
    prisma.event.findFirstOrThrow({ where: { fundId }, orderBy: { period: "asc" } }),
    prisma.rosterMember.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } }),
  ]);
  try {
    return await copyMonth(fund, first, event, period, roster);
  } catch (err) {
    // A concurrent request got there first: go to the month it made.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const made = await find();
      if (made) return made;
    }
    throw err;
  }
}

/**
 * Dates count from the fund's first month, not the previous one, so a fund
 * started on the 31st is back on the 31st after February's 28th.
 */
function copyMonth(fund: Fund, first: Event, from: Event, period: string, roster: RosterMember[]): Promise<Event> {
  const offset = monthsBetween(first.period!, period);
  return prisma.$transaction(async (tx) => {
    const month = await tx.event.create({
      data: {
        organizerId: from.organizerId,
        fundId: fund.id,
        period,
        name: monthName(fund.name, period),
        date: addMonths(first.date, offset),
        dueDate: first.dueDate ? addMonths(first.dueDate, offset) : null,
        perHeadAmount: from.perHeadAmount,
        organizerName: from.organizerName,
        organizerUpiVpa: from.organizerUpiVpa,
        startTime: from.startTime,
        venue: from.venue,
        notes: from.notes,
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
