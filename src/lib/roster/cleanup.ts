import { callStructured } from "@/lib/ai/groq";
import { s } from "@/lib/ai/schema";
import { lastDigits } from "@/lib/phone";
import { nameSimilarity } from "@/lib/similarity";
import type { ParsedMember } from "./parseWhatsApp";

export interface CleanMember {
  displayName: string;
  phone: string | null;
  excludeReason: string | null;
}

const cleanupSchema = s.object({
  members: s.array(
    s.object({
      id: s.string(),
      displayName: s.string("Clean human-readable name: no emoji, keep flat/house numbers in brackets."),
      isPerson: s.boolean("False for shops, vendors, offices, bots, broadcast numbers."),
      isOrganizer: s.boolean(),
      duplicateOf: s.nullable(s.string("Id of another entry that is clearly the same person.")),
    }),
  ),
});

const PROMPT = `You clean up a member list from an Indian WhatsApp group so an event organizer can see who is expected to contribute.
For each entry return a clean display name (remove emoji and decorations, keep the name the group knows them by,
keep flat/house numbers as "(302)"), whether it is an individual person, whether it is the organizer, and whether it
duplicates another entry. Never invent names. If an entry is only a phone number, keep it as given.`;

function stripDecorations(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s().'-]/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * LLM-assisted cleanup of the parsed roster. Every change is guarded: renames that
 * drift too far from the original are ignored, and on any AI failure we keep the
 * deterministic list untouched.
 */
export async function cleanRoster(members: ParsedMember[], organizerName: string, eventId: string): Promise<CleanMember[]> {
  const byId = new Map(members.map((m, i) => [`m${i + 1}`, m]));
  const fallback = (): CleanMember[] =>
    members.map((m) => ({ displayName: m.name ? stripDecorations(m.name) || m.name : m.phone!, phone: m.phone, excludeReason: null }));
  if (!members.length) return [];

  let result;
  try {
    result = await callStructured({
      task: "roster_cleanup",
      kind: "text",
      schemaName: "roster_cleanup",
      schema: cleanupSchema,
      eventId,
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            organizerName,
            entries: [...byId].map(([id, m]) => ({ id, name: m.name, phoneEndsWith: lastDigits(m.phone) })),
          }),
        },
      ],
      mock: () => ({
        members: [...byId].map(([id, m]) => ({
          id,
          displayName: m.name ? stripDecorations(m.name) : m.phone!,
          isPerson: !/\b(shop|store|office|enterprises|traders|bot|services)\b/i.test(m.name ?? ""),
          isOrganizer: !!m.name && nameSimilarity(m.name, organizerName) >= 0.95,
          duplicateOf: null,
        })),
      }),
    });
  } catch {
    return fallback();
  }

  const decided = new Map(result.members.map((r) => [r.id, r]));
  const merged = new Set<string>();
  for (const [id, m] of byId) {
    const target = decided.get(id)?.duplicateOf;
    if (!target || target === id || !byId.has(target) || merged.has(target)) continue;
    const survivor = byId.get(target)!;
    // Two different phone numbers are two people, whatever the model thinks.
    if (m.phone && survivor.phone && m.phone !== survivor.phone) continue;
    // Keep the phone number on the surviving entry.
    if (!survivor.phone && m.phone) byId.set(target, { ...survivor, phone: m.phone });
    merged.add(id);
  }

  const out: CleanMember[] = [];
  for (const [id, m] of byId) {
    if (merged.has(id)) continue;
    const r = decided.get(id);
    const original = m.name ?? m.phone!;
    if (!r) {
      out.push({ displayName: original, phone: m.phone, excludeReason: null });
      continue;
    }
    // A member with no name is just a number. The model only saw its last digits, so keep the number.
    const renameOk = !!m.name && nameSimilarity(r.displayName, m.name) >= 0.6;
    out.push({
      displayName: (renameOk ? r.displayName : m.name ? stripDecorations(m.name) : "") || original,
      phone: m.phone,
      excludeReason: r.isOrganizer ? "Organizer" : !r.isPerson ? "Not a person (business/bot)" : null,
    });
  }
  return out;
}
