import { describe, expect, it } from "vitest";
import { checkReminder, generateReminder, groupNudge, templateReminder, toneForAttempt, whatsappLink } from "@/lib/reminders/generate";

const input = {
  name: "Sita",
  eventName: "Diwali 2026",
  amount: 1500,
  dueDate: null,
  link: "https://choruss.test/i/abc?r=tok",
  organizerName: "Ravi",
  language: "en" as const,
  tone: "friendly" as const,
};

describe("reminders", () => {
  it("guardrails catch wrong amounts, missing or extra links", () => {
    expect(checkReminder(`Pay ₹1,500 at ${input.link}`, input)).toEqual([]);
    expect(checkReminder(`Pay ₹1,000 at ${input.link}`, input)).toEqual(["missing or wrong amount"]);
    expect(checkReminder("Pay ₹1500 soon", input)).toEqual(["missing invite link"]);
    expect(checkReminder(`Pay ₹1500 at ${input.link} or https://evil.example`, input)).toEqual(["contains another link"]);
  });

  it("templates pass their own guardrails in every language", () => {
    for (const language of ["en", "hi", "te"] as const) {
      expect(checkReminder(templateReminder({ ...input, language }), input)).toEqual([]);
    }
  });

  it("escalates tone with attempts", () => {
    expect([1, 2, 3, 5].map(toneForAttempt)).toEqual(["friendly", "firm", "final", "final"]);
  });

  it("generates a guarded message in mock mode", async () => {
    const res = await generateReminder(input, "e1");
    expect(checkReminder(res.message, input)).toEqual([]);
  });

  it("builds wa.me links and group nudges", () => {
    expect(whatsappLink("+919848012345", "hi there")).toBe("https://wa.me/919848012345?text=hi%20there");
    expect(whatsappLink(null, "x")).toBe("https://wa.me/?text=x");
    expect(groupNudge({ eventName: "D", missing: ["A", "B"], link: "L", amount: 500, organizerName: "R" })).toContain("• A\n• B");
  });
});
