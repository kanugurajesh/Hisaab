import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRosterInput } from "@/lib/roster/parseWhatsApp";

const fixture = (f: string) => readFileSync(path.join(__dirname, "../fixtures", f), "utf8");
const names = (r: ReturnType<typeof parseRosterInput>) => r.members.map((m) => m.name ?? m.phone).sort();

describe("parseRosterInput", () => {
  it("parses an Android export: senders, added, joined, left, removed and re-added", () => {
    const r = parseRosterInput(fixture("android-export.txt"));
    expect(r.format).toBe("whatsapp_export");
    expect(names(r)).toEqual(
      ["+919848012345", "+919988776655", "Ganesh Sweets Shop", "Priya Sharma", "Ravi Kumar", "Seenu 🪔", "Sita Reddy"].sort(),
    );
    expect(r.stats.left).toBe(1); // Anil 302
  });

  it("parses an iOS export and ignores group-name system lines", () => {
    const r = parseRosterInput(fixture("ios-export.txt"));
    expect(names(r)).toEqual(["Kiran", "Lakshmi Iyer", "Ravi Kumar"]);
  });

  it("parses a pasted member list with phones, admins and noise", () => {
    const r = parseRosterInput(
      ["Group info", "12 participants", "You", "Ravi Kumar Group admin", "+91 98480 12345 ~Suresh", "Sita", "Sita"].join("\n"),
    );
    expect(r.format).toBe("list");
    expect(r.members).toEqual([
      { key: "ravi kumar", name: "Ravi Kumar", phone: null },
      { key: "+919848012345", name: "Suresh", phone: "+919848012345" },
      { key: "sita", name: "Sita", phone: null },
    ]);
  });

  it("parses a CSV with quoted fields", () => {
    const r = parseRosterInput('Name,Mobile\n"Reddy, Sita",9848012345\nAnil,');
    expect(r.format).toBe("csv");
    expect(r.members.map((m) => [m.name, m.phone])).toEqual([
      ["Reddy, Sita", "+919848012345"],
      ["Anil", null],
    ]);
  });

  it("never returns message bodies", () => {
    const r = parseRosterInput(fixture("android-export.txt"));
    expect(JSON.stringify(r)).not.toMatch(/Count me in|Order booked|dinner/);
  });
});
