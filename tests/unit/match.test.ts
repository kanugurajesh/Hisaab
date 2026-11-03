import { describe, expect, it } from "vitest";
import { deterministicMatches, generateCandidates, matchRoster, resolveProposals } from "@/lib/roster/match";

const r = (id: string, displayName: string, phone: string | null = null) => ({ id, displayName, phone });
const c = (id: string, name: string, phone: string | null = null, payerName: string | null = null) => ({ id, name, phone, payerName });

describe("matching", () => {
  it("matches by phone first, then by unambiguous exact name", () => {
    const res = deterministicMatches(
      [r("r1", "Seenu", "+919848012345"), r("r2", "Sita Reddy"), r("r3", "Priya"), r("r4", "Priya")],
      [c("c1", "Srinivas Rao", "+919848012345"), c("c2", "sita reddy"), c("c3", "Priya")],
    );
    expect(res.decisions.map((d) => [d.rosterId, d.contributionId])).toEqual([
      ["r1", "c1"],
      ["r2", "c2"],
    ]);
    // Two Priyas in the group: exact name alone must not decide.
    expect(res.roster.map((x) => x.id)).toEqual(["r3", "r4"]);
  });

  it("never matches different flat numbers or an exact name with a different phone", () => {
    const res = deterministicMatches(
      [r("r1", "Venkat 101"), r("r2", "Priya", "+919000011111"), r("r3", "Anil 302")],
      [c("c1", "Venkat 202"), c("c2", "Priya", "+919000022222"), c("c3", "Anil (302)")],
    );
    expect(res.decisions.map((d) => [d.rosterId, d.contributionId])).toEqual([["r3", "c3"]]);
    // Different flats are not even candidates, so the LLM never sees them.
    expect(generateCandidates([r("r1", "Krishna (B-204)")], [c("c1", "Krishna 305")])).toEqual([]);
    expect(generateCandidates([r("r1", "Anil 302")], [c("c1", "Anil Varma")])).toHaveLength(1);
  });

  it("caps a pair with different phone numbers at a suggestion", () => {
    const cands = generateCandidates([r("r1", "Priya", "+919000011111")], [c("c1", "Priya S", "+919000022222")]);
    const [d] = resolveProposals([{ rosterId: "r1", contributionId: "c1", confidence: 0.97, reason: "" }], cands);
    expect(d.status).toBe("SUGGESTED");
  });

  it("caps a business matched to a person at a suggestion", () => {
    const cands = generateCandidates([r("r1", "Ganesh Sweets")], [c("c1", "Ganesh Iyer")]);
    const [d] = resolveProposals([{ rosterId: "r1", contributionId: "c1", confidence: 0.95, reason: "" }], cands);
    expect(d.status).toBe("SUGGESTED");
  });

  it("uses the UPI payer name as a signal", () => {
    const cands = generateCandidates([r("r1", "Anil Varma")], [c("c1", "AV", null, "ANIL VARMA")]);
    expect(cands[0].candidates[0].contribution.id).toBe("c1");
  });

  it("drops invented ids, enforces one-to-one and thresholds", () => {
    const cands = generateCandidates([r("r1", "Ravi K"), r("r2", "Ravi Kumar")], [c("c1", "Ravi Kumar")]);
    const out = resolveProposals(
      [
        { rosterId: "r1", contributionId: "c1", confidence: 0.7, reason: "" },
        { rosterId: "r2", contributionId: "c1", confidence: 0.95, reason: "" },
        { rosterId: "r1", contributionId: "c999", confidence: 1, reason: "hallucinated" },
      ],
      cands,
    );
    expect(out).toEqual([{ rosterId: "r2", contributionId: "c1", confidence: 0.95, reason: "", status: "MATCHED" }]);
  });

  it("low confidence becomes a suggestion, not a match", () => {
    const cands = generateCandidates([r("r1", "Ravi K")], [c("c1", "Ravi Kumar")]);
    const [d] = resolveProposals([{ rosterId: "r1", contributionId: "c1", confidence: 0.75, reason: "" }], cands);
    expect(d.status).toBe("SUGGESTED");
  });

  it("runs the full pipeline in mock mode", async () => {
    const out = await matchRoster([r("r1", "Lakshmi Iyer"), r("r2", "Sita Reddy")], [c("c1", "Laxmi Iyer")], "e1");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rosterId: "r1", contributionId: "c1" });
  });
});
