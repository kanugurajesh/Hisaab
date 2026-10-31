// "Add to calendar" for the event a contributor paid for: a Google Calendar link
// and an .ics file (Apple Calendar, Outlook). Event times are IST.

import { IST_OFFSET_MS } from "./ist";

export interface CalendarEvent {
  name: string;
  date: Date;
  startTime: string | null; // "HH:MM"
  venue: string | null;
  notes: string | null;
  organizerName: string;
}

const DURATION_HOURS = 3;

/** The calendar day of the event, as the organizer picked it (stored as UTC midnight). */
const day = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

function span(e: CalendarEvent): { start: string; end: string; allDay: boolean } {
  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(e.startTime ?? "");
  if (!time) {
    const next = new Date(e.date.getTime() + 86_400_000);
    return { start: day(e.date), end: day(next), allDay: true };
  }
  const startUtc = Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), e.date.getUTCDate(), +time[1], +time[2]) - IST_OFFSET_MS;
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { start: stamp(startUtc), end: stamp(startUtc + DURATION_HOURS * 3600_000), allDay: false };
}

const description = (e: CalendarEvent) => [e.notes, `Organized by ${e.organizerName}. You've paid your contribution.`].filter(Boolean).join("\n\n");

export function googleCalendarUrl(e: CalendarEvent): string {
  const { start, end } = span(e);
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.name, dates: `${start}/${end}`, details: description(e), ctz: "Asia/Kolkata" });
  if (e.venue) params.set("location", e.venue);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function icsFile(e: CalendarEvent & { uid: string }, now = new Date()): string {
  const { start, end, allDay } = span(e);
  const when = allDay ? [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`] : [`DTSTART:${start}`, `DTEND:${end}`];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hisaab//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@hisaab`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    ...when,
    `SUMMARY:${escapeIcs(e.name)}`,
    `DESCRIPTION:${escapeIcs(description(e))}`,
    ...(e.venue ? [`LOCATION:${escapeIcs(e.venue)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const mapsUrl = (venue: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;

/** "6:30 pm" from "18:30". */
export function formatTime(startTime: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime ?? "");
  if (!m) return null;
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}
