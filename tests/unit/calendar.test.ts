import { describe, expect, it } from "vitest";
import { formatTime, googleCalendarUrl, icsFile, mapsUrl } from "@/lib/calendar";

const base = { name: "Diwali, Tower B", date: new Date("2026-11-08T00:00:00Z"), venue: null, notes: null, organizerName: "Ravi" };

describe("add to calendar", () => {
  it("converts an IST start time to UTC", () => {
    const url = new URL(googleCalendarUrl({ ...base, startTime: "18:30", venue: "Clubhouse, Tower B" }));
    expect(url.searchParams.get("dates")).toBe("20261108T130000Z/20261108T160000Z");
    expect(url.searchParams.get("location")).toBe("Clubhouse, Tower B");
  });

  it("falls back to an all-day event without a time", () => {
    const url = new URL(googleCalendarUrl({ ...base, startTime: null }));
    expect(url.searchParams.get("dates")).toBe("20261108/20261109");
    expect(icsFile({ ...base, startTime: "bad", uid: "e1" })).toContain("DTSTART;VALUE=DATE:20261108");
  });

  it("escapes .ics text fields", () => {
    const ics = icsFile({ ...base, startTime: "09:05", notes: "Bring diyas; dinner at 8", uid: "e1" });
    expect(ics).toContain("SUMMARY:Diwali\\, Tower B");
    expect(ics).toContain("Bring diyas\\; dinner at 8");
    expect(ics).toContain("DTSTART:20261108T033500Z");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("formats times and map links", () => {
    expect(formatTime("18:30")).toBe("6:30 pm");
    expect(formatTime("00:15")).toBe("12:15 am");
    expect(formatTime(null)).toBeNull();
    expect(mapsUrl("Clubhouse & Lawn")).toContain("query=Clubhouse%20%26%20Lawn");
  });
});
