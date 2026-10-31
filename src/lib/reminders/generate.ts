import { callStructured } from "@/lib/ai/groq";
import { s } from "@/lib/ai/schema";
import { LANGUAGES, type Language, type Tone } from "./constants";

export { LANGUAGES, TONES, type Language, type Tone } from "./constants";

export interface ReminderInput {
  name: string;
  eventName: string;
  amount: number;
  dueDate: Date | null;
  link: string;
  organizerName: string;
  language: Language;
  tone: Tone;
}

export const MAX_REMINDER_CHARS = 600;

export function toneForAttempt(attempt: number): Tone {
  return attempt <= 1 ? "friendly" : attempt === 2 ? "firm" : "final";
}

/** Code-side guardrails: the model may write the words, but not get facts wrong. */
export function checkReminder(message: string, input: Pick<ReminderInput, "amount" | "link">): string[] {
  const problems: string[] = [];
  if (!message.includes(input.link)) problems.push("missing invite link");
  const amounts = [String(input.amount), input.amount.toLocaleString("en-IN")];
  if (!amounts.some((a) => message.includes(a))) problems.push("missing or wrong amount");
  const urls = message.match(/https?:\/\/\S+/g) ?? [];
  if (urls.some((u) => !u.startsWith(input.link))) problems.push("contains another link");
  if (message.length > MAX_REMINDER_CHARS) problems.push("too long");
  return problems;
}

function dueText(due: Date | null, language: Language): string {
  if (!due) return "";
  const d = due.toLocaleDateString(language === "en" ? "en-IN" : `${language}-IN`, { day: "numeric", month: "short" });
  return { en: ` by ${d}`, hi: ` ${d} तक`, te: ` ${d} లోపు` }[language];
}

export function templateReminder(i: ReminderInput): string {
  const amt = `₹${i.amount.toLocaleString("en-IN")}`;
  const due = dueText(i.dueDate, i.language);
  switch (i.language) {
    case "hi":
      return `नमस्ते ${i.name} जी! ${i.eventName} के लिए ${amt} का योगदान${due} बाकी है। यहाँ से जमा करें: ${i.link} — धन्यवाद, ${i.organizerName}`;
    case "te":
      return `నమస్తే ${i.name} గారు! ${i.eventName} కోసం ${amt} కంట్రిబ్యూషన్${due} ఇంకా పెండింగ్‌లో ఉంది. ఇక్కడ చెల్లించండి: ${i.link} — ధన్యవాదాలు, ${i.organizerName}`;
    default:
      return `Hi ${i.name}! Gentle reminder: your ${amt} contribution for ${i.eventName} is pending${due}. Pay and register here: ${i.link} Thanks, ${i.organizerName}`;
  }
}

const reminderSchema = s.object({ message: s.string() });

const PROMPT = `You write short WhatsApp reminder messages for Indian group events (society festivals, trips, office parties).
Write like a polite neighbour, not a bank. 2-4 short sentences, at most one emoji. Never shame the person.
Tone "friendly": warm nudge. "firm": clear that collection is closing. "final": last reminder, still respectful.
You MUST include the exact amount and the exact link given, and no other links. Write only in the requested language
(Hindi in Devanagari, Telugu in Telugu script); keep the link, amount and names as given.`;

export async function generateReminder(input: ReminderInput, eventId: string): Promise<{ message: string; usedFallback: boolean }> {
  const facts = {
    language: LANGUAGES[input.language],
    tone: input.tone,
    name: input.name,
    event: input.eventName,
    amount: `₹${input.amount.toLocaleString("en-IN")}`,
    dueDate: input.dueDate?.toDateString() ?? null,
    link: input.link,
    organizer: input.organizerName,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { message } = await callStructured({
        task: "reminder",
        kind: "text",
        schemaName: "reminder",
        schema: reminderSchema,
        eventId,
        temperature: 0.7,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: JSON.stringify(facts) },
        ],
        mock: () => ({ message: templateReminder(input) }),
      });
      const text = message.trim();
      if (!checkReminder(text, input).length) return { message: text, usedFallback: false };
    } catch {
      break;
    }
  }
  return { message: templateReminder(input), usedFallback: true };
}

export function groupNudge(opts: { eventName: string; missing: string[]; link: string; amount: number; organizerName: string }): string {
  const names = opts.missing.slice(0, 40).map((n) => `• ${n}`).join("\n");
  const more = opts.missing.length > 40 ? `\n…and ${opts.missing.length - 40} more` : "";
  return `🙏 ${opts.eventName}: we're almost there! Still waiting on ₹${opts.amount.toLocaleString("en-IN")} from:\n${names}${more}\n\nPay and register here: ${opts.link}\nIf you've already paid, please register at the link so we can tick you off. Thanks! — ${opts.organizerName}`;
}

export function whatsappLink(phone: string | null, text: string): string {
  const digits = phone?.replace(/\D/g, "");
  return `https://wa.me/${digits ?? ""}?text=${encodeURIComponent(text)}`;
}
