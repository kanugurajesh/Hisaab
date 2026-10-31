import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { cleanRoster } from "@/lib/roster/cleanup";
import { parseRosterInput } from "@/lib/roster/parseWhatsApp";
import { normalizeName } from "@/lib/similarity";
import { runMatching } from "./matching";

export const newNudgeToken = () => randomBytes(9).toString("base64url");

export async function importRoster(eventId: string, text: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const parsed = parseRosterInput(text);
  const cleaned = await cleanRoster(parsed.members, event.organizerName, eventId);

  // Skip people already on the roster (re-importing a newer export is common).
  const existing = await prisma.rosterMember.findMany({ where: { eventId }, select: { displayName: true, phone: true } });
  const seenPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const seenNames = new Set(existing.map((e) => normalizeName(e.displayName)));
  const fresh = cleaned.filter((m) => (m.phone ? !seenPhones.has(m.phone) : !seenNames.has(normalizeName(m.displayName))));

  const source = parsed.format === "whatsapp_export" ? "WHATSAPP_EXPORT" : "PASTE";
  await prisma.rosterMember.createMany({
    data: fresh.map((m) => ({
      eventId,
      displayName: m.displayName,
      phone: m.phone,
      source,
      status: m.excludeReason ? "EXCLUDED" : "PENDING",
      matchReason: m.excludeReason,
      nudgeToken: newNudgeToken(),
    })),
  });
  const match = await runMatching(eventId);
  return {
    format: parsed.format,
    found: parsed.members.length,
    added: fresh.length,
    excluded: fresh.filter((m) => m.excludeReason).length,
    leftGroup: parsed.stats.left,
    ...match,
  };
}
