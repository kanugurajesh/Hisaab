import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildFundGrid,
  canStartNextMonth,
  earlierMisses,
  finishedMonths,
  monthLabel,
  monthsBetween,
  nextPeriod,
  periodOf,
  type FundMonthInput,
} from "@/lib/funds/months";

describe("month helpers", () => {
  it("moves to the next month across a year end", () => {
    expect(nextPeriod("2026-11")).toBe("2026-12");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });

  it("reads the month in IST, not UTC", () => {
    // 1 Nov, 00:30 in India is still 31 Oct in UTC.
    expect(periodOf(new Date("2026-11-01T00:30:00+05:30"))).toBe("2026-11");
    expect(periodOf(new Date("2026-10-31T23:30:00+05:30"))).toBe("2026-10");
  });

  it("keeps the day of the month, clamped to short months", () => {
    expect(addMonths(new Date("2026-10-08T00:00:00Z"), 1).toISOString()).toBe("2026-11-08T00:00:00.000Z");
    expect(periodOf(addMonths(new Date("2027-01-31T10:00:00+05:30"), 1))).toBe("2027-02");
    expect(addMonths(new Date("2027-01-31T10:00:00+05:30"), 1)).toEqual(new Date("2027-02-28T10:00:00+05:30"));
    expect(addMonths(new Date("2026-12-15T10:00:00+05:30"), 1)).toEqual(new Date("2027-01-15T10:00:00+05:30"));
  });

  it("counts months between periods, across years", () => {
    expect(monthsBetween("2026-11", "2027-02")).toBe(3);
    expect(monthsBetween("2026-01", "2026-01")).toBe(0);
    // Counting from the first month keeps the 31st: Jan 31 → Feb 28 → Mar 31.
    const jan31 = new Date("2027-01-31T10:00:00+05:30");
    expect(addMonths(jan31, monthsBetween("2027-01", "2027-03"))).toEqual(new Date("2027-03-31T10:00:00+05:30"));
  });

  it("opens next month only once this month has begun", () => {
    const nov20 = new Date("2026-11-20T12:00:00+05:30");
    expect(canStartNextMonth("2026-11", nov20)).toBe(true); // December, during November
    expect(canStartNextMonth("2026-12", nov20)).toBe(false); // not January yet
  });

  it("labels months", () => {
    expect(monthLabel("2026-11")).toBe("Nov 2026");
    expect(monthLabel("2026-11", true)).toBe("Nov");
  });
});

describe("buildFundGrid", () => {
  type Status = "MATCHED" | "SUGGESTED" | "PENDING" | "EXCLUDED";
  const member = (key: string, status: Status, amount = 500, rejected = false) => ({
    id: `${key}-${Math.random().toString(36).slice(2, 8)}`,
    personKey: key,
    displayName: key[0].toUpperCase() + key.slice(1),
    phone: null,
    status,
    contribution: status === "MATCHED" || status === "SUGGESTED" ? { amount, verificationStatus: rejected ? ("REJECTED" as const) : ("APPROVED" as const) } : null,
  });
  const month = (period: string, roster: ReturnType<typeof member>[], status: "OPEN" | "CLOSED" = "CLOSED"): FundMonthInput => ({ id: period, period, status, roster });

  // Today is 5 Nov 2026: November is still collecting.
  const now = new Date("2026-11-05T12:00:00+05:30");
  const months = [
    month("2026-08", [member("asha", "MATCHED"), member("ravi", "MATCHED"), member("shop", "EXCLUDED")]),
    month("2026-09", [member("asha", "MATCHED"), member("ravi", "PENDING"), member("shop", "EXCLUDED")]),
    month("2026-10", [member("asha", "MATCHED"), member("ravi", "PENDING"), member("kiran", "PENDING"), member("shop", "EXCLUDED")]),
    month("2026-11", [member("asha", "PENDING"), member("ravi", "PENDING"), member("kiran", "PENDING"), member("shop", "EXCLUDED")], "OPEN"),
  ];

  it("follows each person across months, with a cell per month", () => {
    const { rows } = buildFundGrid(months, now);
    const ravi = rows.find((r) => r.personKey === "ravi")!;
    expect(ravi.cells).toEqual(["paid", "unpaid", "unpaid", "unpaid"]);
    const kiran = rows.find((r) => r.personKey === "kiran")!;
    expect(kiran.cells).toEqual(["absent", "absent", "unpaid", "unpaid"]); // joined in October
  });

  it("doesn't count the month that's still collecting as missed", () => {
    const { rows } = buildFundGrid(months, now);
    const by = (k: string) => rows.find((r) => r.personKey === k)!;
    expect(by("ravi").missedPeriods).toEqual(["2026-09", "2026-10"]);
    expect(by("asha").missedInARow).toBe(0); // hasn't paid November yet, but it's the 5th
    expect(by("kiran").missedInARow).toBe(1);
  });

  it("doesn't count a month still collecting when the next one was started early", () => {
    const early = [...months, month("2026-12", [member("asha", "PENDING"), member("ravi", "PENDING"), member("kiran", "PENDING")], "OPEN")];
    const grid = buildFundGrid(early, new Date("2026-11-20T12:00:00+05:30"));
    const by = (k: string) => grid.rows.find((r) => r.personKey === k)!;
    expect(finishedMonths(grid.months, new Date("2026-11-20T12:00:00+05:30"))).toBe(3);
    expect(by("asha").missedInARow).toBe(0);
    expect(by("ravi").missedPeriods).toEqual(["2026-09", "2026-10"]);
  });

  it("doesn't count a month that hasn't started, even if it was closed by mistake", () => {
    const closedEarly = [...months, month("2026-12", [member("asha", "PENDING"), member("ravi", "PENDING"), member("kiran", "PENDING")], "CLOSED")];
    const grid = buildFundGrid(closedEarly, new Date("2026-11-20T12:00:00+05:30"));
    expect(grid.rows.find((r) => r.personKey === "asha")!.missedInARow).toBe(0);
  });

  it("doesn't say 'also missed' a month that is still collecting", () => {
    const early = [...months, month("2026-12", [member("asha", "PENDING"), member("ravi", "PENDING"), member("kiran", "PENDING")], "OPEN")];
    const at = new Date("2026-11-20T12:00:00+05:30");
    const grid = buildFundGrid(early, at);
    const december = earlierMisses(grid, "2026-12", at);
    const row = (k: string) => grid.rows.find((r) => r.personKey === k)!;
    expect(december.get(row("ravi").rosterIds[4]!)).toEqual(["2026-09", "2026-10"]); // November skipped
    expect(december.has(row("asha").rosterIds[4]!)).toBe(false);
  });

  it("counts the latest month once it's closed or over", () => {
    const later = new Date("2026-12-02T12:00:00+05:30");
    expect(buildFundGrid(months, later).rows.find((r) => r.personKey === "ravi")!.missedInARow).toBe(3);
  });

  it("sorts the people furthest behind first and leaves out people never expected to pay", () => {
    const { rows } = buildFundGrid(months, now);
    expect(rows.map((r) => r.personKey)).toEqual(["ravi", "kiran", "asha"]);
  });

  it("totals what each person paid this calendar year, without rejected payments or likely matches", () => {
    const grid = buildFundGrid(
      [
        month("2025-12", [member("asha", "MATCHED", 500)]),
        month("2026-01", [member("asha", "MATCHED", 700)]),
        month("2026-02", [member("asha", "MATCHED", 500, true)]),
        month("2026-03", [member("asha", "SUGGESTED", 500)]),
      ],
      now,
    );
    expect(grid.rows[0].paidThisYear).toBe(700);
  });

  it("lists the months each unpaid person also missed right before a given month", () => {
    const grid = buildFundGrid(months, now);
    const november = earlierMisses(grid, "2026-11");
    const raviNov = grid.rows.find((r) => r.personKey === "ravi")!.rosterIds[3]!;
    const ashaNov = grid.rows.find((r) => r.personKey === "asha")!.rosterIds[3]!;
    expect(november.get(raviNov)).toEqual(["2026-09", "2026-10"]);
    expect(november.has(ashaNov)).toBe(false);
  });
});
