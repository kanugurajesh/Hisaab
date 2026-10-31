import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderReceipt } from "../../eval/lib/renderReceipt";
import { isSameScreenshot } from "@/lib/verify/duplicates";
import type { ProofExtraction } from "@/lib/verify/extract";
import { hammingDistance, prepareProofImage } from "@/lib/verify/image";

const receipt = (payer: string, utr: string) =>
  renderReceipt({ style: "blue", status: "success", amount: 500, payeeName: "Ravi Kumar", payeeVpa: "ravi.kumar@okicici", payerName: payer, bank: "SBI", utr, when: "2 Oct 2026, 9:10 pm" });
const read = (utr: string, timestamp = "2026-10-02T21:10"): ProofExtraction => ({
  isPaymentScreenshot: true,
  app: "phonepe",
  status: "success",
  amount: 500,
  utr,
  payeeName: "Ravi Kumar",
  payeeVpa: "ravi.kumar@okicici",
  payerName: null,
  timestamp,
  readability: "high",
});

describe("isSameScreenshot", () => {
  it("two genuine payments from the same app look alike, but aren't the same screenshot", async () => {
    const sita = await prepareProofImage(await receipt("SITA REDDY", "430511113333"));
    const kiran = await prepareProofImage(await receipt("KIRAN", "430511114444"));
    // This is why pixels alone can't decide: the hashes are near-identical.
    expect(hammingDistance(sita.dhash, kiran.dhash)).toBeLessThanOrEqual(6);
    const stored = { utr: "430511113333", proofSha256: sita.sha256, proofPhash: sita.dhash, extracted: read("430511113333") };
    expect(isSameScreenshot(stored, kiran, read("430511114444", "2026-10-02T21:25"))).toBe(false);
  });

  it("catches a re-compressed copy, and an edited copy that keeps the time and amount", async () => {
    const original = await receipt("SITA REDDY", "430511113333");
    const a = await prepareProofImage(original);
    const copy = await prepareProofImage(await sharp(original).jpeg({ quality: 50 }).toBuffer());
    const stored = { utr: "430511113333", proofSha256: a.sha256, proofPhash: a.dhash, extracted: read("430511113333") };
    expect(isSameScreenshot(stored, copy, read("430511113333"))).toBe(true);
    expect(isSameScreenshot(stored, copy, read("430599999999"))).toBe(true); // UTR digits edited, same minute
    expect(isSameScreenshot(stored, copy, { ...read("430599999999"), timestamp: null, utr: null })).toBe(true); // nothing to compare
  });
});
