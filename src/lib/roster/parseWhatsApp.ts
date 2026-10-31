import { normalizePhone } from "@/lib/phone";

// Deterministic parsing of what organizers actually have: a WhatsApp chat export,
// a pasted list of names/numbers, or a CSV. Message bodies are discarded here so
// that no private chat text ever reaches the LLM.

export type RosterFormat = "whatsapp_export" | "csv" | "list";

export interface ParsedMember {
  key: string;
  name: string | null;
  phone: string | null;
}

export interface ParsedRoster {
  format: RosterFormat;
  members: ParsedMember[];
  stats: { lines: number; left: number };
}

const INVISIBLE = /[‎‏‪-‮﻿]/g;
const DATE = String.raw`\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}`;
const TIME = String.raw`\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:[\s  ]?(?:[aApP]\.?[mM]\.?))?`;
const ANDROID_LINE = new RegExp(String.raw`^(${DATE}),?\s(${TIME})\s[-–]\s(.*)$`);
const IOS_LINE = new RegExp(String.raw`^\[(${DATE}),?\s(${TIME})\]\s(.*)$`);

const IGNORED_SYSTEM = [
  /end-to-end encrypted/i,
  / created (group|this group)/i,
  / changed (the subject|this group's icon|the group description|the group name|their phone number|the settings)/i,
  /^you're now an admin/i,
  / deleted this group's icon/i,
  /^this message was deleted/i,
];

const IOS_MEDIA_BODY = /^(<attached: [^>]+>|(image|video|audio|sticker|GIF|document|Contact card) omitted)/i;

function headerBody(line: string): { body: string; ios: boolean } | null {
  const android = ANDROID_LINE.exec(line);
  if (android) return { body: android[3], ios: false };
  const ios = IOS_LINE.exec(line);
  if (ios) return { body: ios[3], ios: true };
  return null;
}

function cleanName(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/^~\s*/, "").trim();
}

function splitNames(list: string): string[] {
  return list
    .split(/,\s*|\s+and\s+/)
    .map(cleanName)
    .filter(Boolean);
}

function toMember(raw: string): ParsedMember | null {
  const name = cleanName(raw);
  if (!name || /^you$/i.test(name)) return null;
  const phone = normalizePhone(name);
  if (phone) return { key: phone, name: null, phone };
  return { key: name.toLowerCase(), name, phone: null };
}

function parseExport(lines: string[]): ParsedRoster {
  const state = new Map<string, { member: ParsedMember; active: boolean }>();
  const mark = (raw: string, active: boolean) => {
    const m = toMember(raw);
    if (!m) return;
    state.set(m.key, { member: state.get(m.key)?.member ?? m, active });
  };

  for (const rawLine of lines) {
    const header = headerBody(rawLine.replace(/^[‎﻿]+/, ""));
    if (!header) continue; // continuation of a multi-line message
    let body = header.body;

    // iOS prefixes system lines with "<Group name>: ‎"; Android has no sender.
    // Media lines ("Ravi: ‎<attached: …>", "Ravi: ‎image omitted") carry the same
    // mark but are real messages, often a payment screenshot.
    const colon = body.indexOf(": ");
    let sender: string | null = null;
    if (colon > 0) {
      const rest = body.slice(colon + 2);
      if (header.ios && rest.startsWith("‎") && !IOS_MEDIA_BODY.test(rest.replace(INVISIBLE, "").trim())) body = rest;
      else {
        sender = body.slice(0, colon);
        body = rest;
      }
    }
    body = body.replace(INVISIBLE, "").trim();

    if (sender) {
      mark(sender, true);
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(.+?) created group/.exec(body))) {
      mark(m[1], true);
      continue;
    }
    if (IGNORED_SYSTEM.some((re) => re.test(body))) continue;

    // Whoever adds or removes people is an admin, and so a member.
    if ((m = /^(.+?) added (.+)$/.exec(body))) {
      mark(m[1], true);
      splitNames(m[2]).forEach((n) => mark(n, true));
    }
    else if ((m = /^(.+?) joined (?:using this group's invite link|from the community|via invite link)$/i.exec(body)))
      mark(m[1], true);
    else if ((m = /^(.+?) removed (.+)$/.exec(body))) {
      mark(m[1], true);
      splitNames(m[2]).forEach((n) => mark(n, false));
    }
    else if ((m = /^(.+?) left$/.exec(body))) mark(m[1], false);
  }

  const all = [...state.values()];
  const members = all.filter((s) => s.active).map((s) => s.member);
  return { format: "whatsapp_export", members, stats: { lines: lines.length, left: all.length - members.length } };
}

const LIST_NOISE = /^(group info|participants?|\d+ participants|add participants|invite (to group )?via link|view all.*|search|exit group|report group)$/i;

function parseList(lines: string[]): ParsedRoster {
  const members: ParsedMember[] = [];
  for (const raw of lines) {
    const line = raw.replace(INVISIBLE, "").replace(/\b(group admin|admin)\b/gi, "").trim();
    if (!line || LIST_NOISE.test(line) || /^you$/i.test(line)) continue;
    const phoneMatch = line.match(/\+?\d[\d\s-]{8,}\d/);
    const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
    const name = cleanName(line.replace(phoneMatch?.[0] ?? "", "").replace(/^[\s,;:\-–~]+|[\s,;:\-–]+$/g, "")) || null;
    if (!name && !phone) continue;
    members.push({ key: phone ?? name!.toLowerCase(), name, phone });
  }
  return { format: "list", members: dedupe(members), stats: { lines: lines.length, left: 0 } };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(lines: string[]): ParsedRoster {
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => /name/.test(h));
  const phoneIdx = header.findIndex((h) => /phone|mobile|number|whatsapp/.test(h));
  const members: ParsedMember[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const name = nameIdx >= 0 ? cleanName(cols[nameIdx] ?? "") || null : null;
    const phone = phoneIdx >= 0 ? normalizePhone(cols[phoneIdx]) : null;
    if (!name && !phone) continue;
    members.push({ key: phone ?? name!.toLowerCase(), name, phone });
  }
  return { format: "csv", members: dedupe(members), stats: { lines: lines.length, left: 0 } };
}

function dedupe(members: ParsedMember[]): ParsedMember[] {
  const seen = new Map<string, ParsedMember>();
  for (const m of members) if (!seen.has(m.key)) seen.set(m.key, m);
  return [...seen.values()];
}

export function parseRosterInput(text: string): ParsedRoster {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { format: "list", members: [], stats: { lines: 0, left: 0 } };
  const headerLines = lines.filter((l) => headerBody(l.replace(/^[‎﻿]+/, ""))).length;
  if (headerLines >= Math.max(2, lines.length * 0.3)) return parseExport(lines);
  if (lines[0].includes(",") && /name/i.test(lines[0])) return parseCsv(lines);
  return parseList(lines);
}
