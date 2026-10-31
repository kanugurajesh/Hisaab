import type { RosterStatus, VerificationStatus } from "@prisma/client";
import { IST_OFFSET_MS, istIso, toIst } from "@/lib/ist";

// A fund is a chain of monthly collections ("2026-09", "2026-10", …). Each
// month is an ordinary Event; this file turns those months into the view a
// monthly organizer needs: who paid which month, who keeps missing, and how
// much each person has paid this year. Pure functions, no database.

/** "2026-11" for a moment, read in IST. */
export function periodOf(date: Date): string {
  return istIso(date).slice(0, 7);
}

/** Whole months from one period to another: monthsBetween("2026-11", "2027-02") is 3. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * The month after `period` can be started once `period` itself has begun:
 * December can be opened during November, but not January.
 */
export function canStartNextMonth(period: string, now: Date): boolean {
  return period <= periodOf(now);
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** "Nov 2026", or "Nov" with short. */
export function monthLabel(period: string, short = false): string {
  const [y, m] = period.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  return short ? name : `${name} ${y}`;
}

/** Same day next month in IST, clamped: 31 Jan + 1 month = 28 Feb. */
export function addMonths(date: Date, n: number): Date {
  const ist = toIst(date);
  const first = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + n, 1));
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shifted = Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    Math.min(ist.getUTCDate(), daysInMonth),
    ist.getUTCHours(),
    ist.getUTCMinutes(),
    ist.getUTCSeconds(),
    ist.getUTCMilliseconds(),
  );
  return new Date(shifted - IST_OFFSET_MS);
}

export type Cell = "paid" | "likely" | "unpaid" | "excluded" | "absent";

export interface FundMonthInput {
  id: string;
  period: string;
  status: "OPEN" | "CLOSED";
  roster: {
    id: string;
    personKey: string | null;
    displayName: string;
    phone: string | null;
    status: RosterStatus;
    contribution: { amount: number; verificationStatus: VerificationStatus } | null;
  }[];
}

export interface FundRow {
  personKey: string;
  /** As the latest month they appear in calls them. */
  name: string;
  phone: string | null;
  /** One per month, oldest first, aligned with the months passed in. */
  cells: Cell[];
  /** Their roster row in each month, for links. */
  rosterIds: (string | null)[];
  paidThisYear: number;
  /** Consecutive months not paid, counting back from the latest finished month. */
  missedInARow: number;
  missedPeriods: string[];
}

const CELL: Record<RosterStatus, Cell> = { MATCHED: "paid", SUGGESTED: "likely", PENDING: "unpaid", EXCLUDED: "excluded" };

/**
 * Not yet held against anyone: a month that hasn't started (even if closed by
 * mistake), or this month while it's open. Not paying on the 3rd isn't "missing".
 */
export function isCollecting(month: Pick<FundMonthInput, "period" | "status">, now: Date): boolean {
  const current = periodOf(now);
  return month.period > current || (month.period === current && month.status === "OPEN");
}

/**
 * How many months, oldest first, count against people who didn't pay. Months
 * still collecting at the end don't, and there can be more than one: starting
 * December on 20 Nov leaves November collecting too.
 */
export function finishedMonths(months: Pick<FundMonthInput, "period" | "status">[], now: Date): number {
  let n = months.length;
  while (n > 0 && isCollecting(months[n - 1], now)) n--;
  return n;
}

export function buildFundGrid(input: FundMonthInput[], now = new Date()): { months: FundMonthInput[]; rows: FundRow[] } {
  const months = [...input].sort((a, b) => a.period.localeCompare(b.period));
  const year = periodOf(now).slice(0, 4);
  const byPerson = new Map<string, FundRow>();

  months.forEach((month, i) => {
    for (const r of month.roster) {
      const key = r.personKey ?? r.id;
      let row = byPerson.get(key);
      if (!row) {
        row = {
          personKey: key,
          name: r.displayName,
          phone: r.phone,
          cells: months.map(() => "absent"),
          rosterIds: months.map(() => null),
          paidThisYear: 0,
          missedInARow: 0,
          missedPeriods: [],
        };
        byPerson.set(key, row);
      }
      row.name = r.displayName;
      row.phone = r.phone ?? row.phone;
      row.cells[i] = CELL[r.status];
      row.rosterIds[i] = r.id;
      if (r.status === "MATCHED" && r.contribution && r.contribution.verificationStatus !== "REJECTED" && month.period.startsWith(year)) {
        row.paidThisYear += r.contribution.amount;
      }
    }
  });

  const finished = finishedMonths(months, now);
  for (const row of byPerson.values()) {
    for (let i = finished - 1; i >= 0 && row.cells[i] === "unpaid"; i--) row.missedPeriods.unshift(months[i].period);
    row.missedInARow = row.missedPeriods.length;
  }

  const rows = [...byPerson.values()]
    // People only ever excluded (the organizer, a shop) aren't part of the fund.
    .filter((r) => r.cells.some((c) => c !== "excluded" && c !== "absent"))
    .sort((a, b) => b.missedInARow - a.missedInARow || a.name.localeCompare(b.name));
  return { months, rows };
}

/**
 * For one month: the months each unpaid person also missed right before it.
 * Keyed by that month's roster member id. Used for "also missed Sep, Oct".
 */
export function earlierMisses(grid: ReturnType<typeof buildFundGrid>, period: string, now = new Date()): Map<string, string[]> {
  const at = grid.months.findIndex((m) => m.period === period);
  const out = new Map<string, string[]>();
  if (at < 0) return out;
  for (const row of grid.rows) {
    const rosterId = row.rosterIds[at];
    if (!rosterId || row.cells[at] !== "unpaid") continue;
    const missed: string[] = [];
    for (let i = at - 1; i >= 0; i--) {
      // A month still collecting (November, while December was started early) isn't missed yet.
      if (isCollecting(grid.months[i], now)) continue;
      if (row.cells[i] !== "unpaid") break;
      missed.unshift(grid.months[i].period);
    }
    if (missed.length) out.set(rosterId, missed);
  }
  return out;
}
