import { describe, expect, it } from "vitest";
import type { ProofExtraction } from "@/lib/verify/extract";
import { evaluateProof, parseProofTimestamp } from "@/lib/verify/rules";

const now = new Date("2026-10-31T12:00:00+05:30");
const event = {
  perHeadAmount: 500,
  organizerUpiVpa: "ravi.kumar@okicici",
  organizerName: "Ravi Kumar",
  createdAt: new Date("2026-10-20T10:00:00+05:30"),
};
const good: ProofExtraction = {
  isPaymentScreenshot: true,
  app: "gpay",
  status: "success",
  amount: 500,
  utr: "430512345678",
  payeeName: "RAVI KUMAR",
  payeeVpa: "Ravi.Kumar@okicici",
  payerName: "Sita Reddy",
  timestamp: "2026-10-30T19:42",
  readability: "high",
};
const noDupes = { utrUsedBy: null, imageUsedBy: null };

function run(
  x: Partial<ProofExtraction> = {},
  declared: { amount: number; utr: string | null } = { amount: 500, utr: null },
  duplicates: { utrUsedBy: string | null; imageUsedBy: string | null } = noDupes,
) {
  return evaluateProof({ extracted: { ...good, ...x }, declared, event, duplicates, now });
}
const failed = (res: ReturnType<typeof run>) => res.checks.filter((c) => !c.pass).map((c) => c.id);

describe("evaluateProof", () => {
  it("verifies a clean screenshot", () => {
    expect(run().verified).toBe(true);
  });

  it("parses screenshot time as IST", () => {
    expect(parseProofTimestamp("2026-10-30T19:42")?.toISOString()).toBe("2026-10-30T14:12:00.000Z");
    expect(parseProofTimestamp("2026-10-30 19:42:05")?.toISOString()).toBe("2026-10-30T14:12:00.000Z");
  });

  it.each<[Partial<ProofExtraction>, string]>([
    [{ amount: 50 }, "amount_matches"],
    [{ status: "pending" }, "status_success"],
    [{ payeeVpa: "someone@ybl" }, "payee_matches"],
    [{ timestamp: "2026-11-05T10:00" }, "time_window"],
    [{ timestamp: "2026-09-01T10:00" }, "time_window"],
    [{ utr: "12345" }, "utr_format"],
    [{ isPaymentScreenshot: false }, "is_payment"],
  ])("flags %o", (x, id) => {
    const res = run(x);
    expect(res.verified).toBe(false);
    expect(failed(res)).toContain(id);
  });

  it("falls back to payee name when the UPI ID is hidden", () => {
    expect(run({ payeeVpa: null }).verified).toBe(true);
    expect(failed(run({ payeeVpa: null, payeeName: "Suresh Babu" }))).toEqual(["payee_matches"]);
  });

  it("flags duplicates and typed-UTR mismatches", () => {
    expect(failed(run({}, undefined, { utrUsedBy: "Anil", imageUsedBy: "Anil" }))).toEqual(["utr_unique", "image_unique"]);
    expect(failed(run({}, { amount: 500, utr: "999999999999" }))).toEqual(["utr_matches_entered"]);
  });

  it("flags under-payment against the per-head amount", () => {
    expect(failed(run({ amount: 300 }, { amount: 300, utr: null }))).toEqual(["amount_minimum"]);
  });
});
