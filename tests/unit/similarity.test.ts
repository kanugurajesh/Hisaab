import { describe, expect, it } from "vitest";
import { nameSimilarity, normalizeName } from "@/lib/similarity";

describe("nameSimilarity", () => {
  it("normalizes honorifics, emoji and flat numbers", () => {
    expect(normalizeName("Dr. Sita Ram ji 🙏 Flat 302")).toBe("sita ram");
  });

  it.each([
    ["Ravi K", "Ravi Kumar", 0.85],
    ["Kumar Ravi", "Ravi Kumar", 0.95],
    ["Ravi", "Ravi Kumar", 0.9],
    ["Laxmi Iyer", "Lakshmi Iyer", 0.85],
  ])("%s ~ %s", (a, b, min) => expect(nameSimilarity(a, b)).toBeGreaterThanOrEqual(min));

  it("keeps different people apart", () => {
    expect(nameSimilarity("Ravi Kumar", "Sita Reddy")).toBeLessThan(0.55);
    expect(nameSimilarity("Priya Sharma", "Priya Verma")).toBeLessThan(0.8);
    // A shared surname must not carry two different first names.
    expect(nameSimilarity("Shalini Rao", "Srinivas Rao")).toBeLessThan(0.8);
  });

  it("handles split vs joined spellings", () => {
    expect(nameSimilarity("Hema Latha", "Hemalatha")).toBeGreaterThanOrEqual(0.9);
  });
});
