import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { s } from "@/lib/ai/schema";
import { matchesName } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { buildUpiLink, isValidUtr, isValidVpa } from "@/lib/upi";
import { proofSchema } from "@/lib/verify/extract";
import { dhash, hammingDistance, InvalidImageError, prepareProofImage } from "@/lib/verify/image";

describe("phone and UPI", () => {
  it("normalizes Indian numbers", () => {
    expect(normalizePhone("98480 12345")).toBe("+919848012345");
    expect(normalizePhone("+91-98480-12345")).toBe("+919848012345");
    expect(normalizePhone("Ravi")).toBeNull();
  });

  it("builds UPI intents and validates ids", () => {
    expect(buildUpiLink({ vpa: "Ravi@OKICICI", payeeName: "Ravi K", amount: 500, note: "Diwali" })).toBe(
      "upi://pay?pa=ravi%40okicici&pn=Ravi+K&am=500.00&cu=INR&tn=Diwali",
    );
    expect(isValidVpa("ravi.kumar@okicici")).toBe(true);
    expect(isValidVpa("ravi")).toBe(false);
    expect(isValidUtr("430512345678")).toBe(true);
  });
});

describe("Groq strict schema builder", () => {
  it("marks every property required and objects closed, nullable as type unions", () => {
    const json = proofSchema.json as {
      required: string[];
      properties: Record<string, { type: unknown }>;
      additionalProperties: boolean;
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(Object.keys(json.properties));
    expect(json.properties.amount.type).toEqual(["number", "null"]);
    const nested = s.object({ a: s.array(s.object({ b: s.nullable(s.enum(["x", "y"])) })) });
    expect(nested.json).toMatchObject({
      properties: { a: { items: { additionalProperties: false, properties: { b: { enum: ["x", "y", null] } } } } },
    });
  });
});

describe("image handling", () => {
  const screenshot = () =>
    sharp({ create: { width: 200, height: 400, channels: 3, background: "white" } })
      .composite([{ input: Buffer.from('<svg width="200" height="400"><rect x="20" y="40" width="80" height="120" fill="black"/></svg>') }])
      .png()
      .toBuffer();

  it("rejects non-images regardless of claimed type", async () => {
    await expect(prepareProofImage(Buffer.from("not an image"))).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("re-compressed copies of the same screenshot have near-identical hashes", async () => {
    const a = await screenshot();
    const b = await sharp(a).jpeg({ quality: 40 }).toBuffer();
    expect(hammingDistance(await dhash(a), await dhash(b))).toBeLessThanOrEqual(6);
  });
});

describe("matchesName", () => {
  it("forgives case and punctuation a phone keyboard makes hard, but not different words", () => {
    expect(matchesName("sai nagar ganesh fund nov 2026", "Sai Nagar Ganesh Fund · Nov 2026")).toBe(true);
    expect(matchesName("Sai Nagar Ganesh Fund - Nov 2026", "Sai Nagar Ganesh Fund · Nov 2026")).toBe(true);
    expect(matchesName("Sai Nagar Ganesh Fund Oct 2026", "Sai Nagar Ganesh Fund · Nov 2026")).toBe(false);
    expect(matchesName(" · ", "·")).toBe(false);
  });
});
