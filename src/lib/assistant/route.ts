import type { z } from "zod";
import { AiError, callStructured } from "@/lib/ai/groq";
import { s } from "@/lib/ai/schema";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";

// The organizer's assistant. The model only decides WHICH lookup to run and with
// what filters; code runs it and writes the answer. So it can misroute a question,
// but it can never invent a payment, a name or a number. Only the organizer's own
// question reaches the model: names and other text from contributors never do.

export const TOOLS = [
  "summary",
  "unpaid",
  "payments",
  "payment_detail",
  "spending",
  "group_reminder",
  "personal_reminder",
  "money_update",
  "help",
] as const;
export type Tool = (typeof TOOLS)[number];
export const PAYMENT_FILTERS = ["verified", "needs_review", "rejected", "any"] as const;
const LANGUAGE_CODES = ["en", "hi", "te"] as const;

export const routeSchema = s.object({
  tool: s.enum(TOOLS),
  name: s.nullable(s.string("The one person the question is about, as written. Null if it is about everyone.")),
  status: s.nullable(s.enum(PAYMENT_FILTERS)),
  minAmount: s.nullable(s.number("Smallest amount in rupees to include (inclusive)")),
  maxAmount: s.nullable(s.number("Largest amount in rupees to include (inclusive)")),
  category: s.nullable(s.enum(EXPENSE_CATEGORIES)),
  language: s.nullable(s.enum(LANGUAGE_CODES)),
});
export type Route = z.infer<typeof routeSchema.zod>;

const EMPTY: Omit<Route, "tool"> = { name: null, status: null, minAmount: null, maxAmount: null, category: null, language: null };

const PROMPT = `You route an organizer's question about their group money collection (an Indian society festival, trip or party) to ONE lookup.
Tools:
- summary: overall progress: collected, how many paid, balance, how things stand.
- unpaid: who has NOT paid yet / who is left / pending people.
- payments: list registered payments, optionally filtered by status (verified, needs_review = flagged or waiting for review, rejected) and amount range.
- payment_detail: one named person: did they pay, why was their payment flagged, what's their status.
- spending: expenses, bills, what money was spent on, optionally one category.
- group_reminder: draft one reminder message for the whole group / everyone who hasn't paid.
- personal_reminder: draft a reminder for one named person.
- money_update: draft the "where the money went" / accounts update for the group.
- help: anything else, greetings, or questions you can't map.
Rules: "less than 500" means maxAmount 499; "more than 500" means minAmount 501; "500 or more" means minAmount 500.
language is en, hi or te, only if the question asks for Hindi or Telugu (or English). Questions may be in Hinglish or have typos.
Use earlier_questions only to resolve follow-ups like "and in Telugu?" or "what about Anil?". Leave fields null when not asked for.`;

export async function routeQuestion(question: string, earlier: string[], eventId: string): Promise<Route> {
  try {
    return await routeWithModel(question, earlier, eventId);
  } catch (err) {
    // The model is down or kept returning junk: still answer, just less cleverly.
    if (err instanceof AiError) return routeByKeywords(question);
    throw err;
  }
}

/** The model's routing alone, without the keyword fallback (what the eval measures). */
export async function routeWithModel(question: string, earlier: string[], eventId: string): Promise<Route> {
  const route = await callStructured({
    task: "assistant.route",
    kind: "text",
    schemaName: "assistant_route",
    schema: routeSchema,
    eventId,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify({ earlier_questions: earlier.slice(-3), question }) },
    ],
    mock: () => routeByKeywords(question),
    temperature: 0,
  });
  return clean(route);
}

function clean(r: Route): Route {
  const amount = (n: number | null) => (n === null || !Number.isFinite(n) || n < 0 ? null : Math.round(n));
  const name = r.name?.trim().slice(0, 80) || null;
  return { ...r, name, minAmount: amount(r.minAmount), maxAmount: amount(r.maxAmount) };
}

const NOT_A_NAME = new Set(["everyone", "everybody", "all", "the", "group", "people", "them", "us", "we", "me", "this", "that", "payment", "payments", "a", "an"]);
const NAME_STOP = new Set(["in", "paid", "pay", "flagged", "payment", "to", "on", "yet", "already", "with", "and", "for", "please"]);

/** "why was rahul verma flagged" -> "rahul verma"; "remind anil in telugu" -> "anil". */
function extractName(question: string): string | null {
  const m = /\b(?:why (?:was|is|did)|remind|for|about|did|has|of|is)\s+(.+)/i.exec(question);
  if (!m) return null;
  const words = m[1].replace(/[?.!,]/g, " ").split(/\s+/).filter(Boolean);
  const name: string[] = [];
  for (const w of words) {
    if (NAME_STOP.has(w.toLowerCase()) || !/^[a-z]/i.test(w) || name.length === 2) break;
    name.push(w);
  }
  return name.length && !NOT_A_NAME.has(name[0].toLowerCase()) ? name.join(" ") : null;
}

/** Deterministic routing: the AI_MOCK stand-in, and the fallback when the model is unavailable. */
export function routeByKeywords(question: string): Route {
  const q = question.toLowerCase();
  const language = /telugu/.test(q) ? "te" : /hindi/.test(q) ? "hi" : /english/.test(q) ? "en" : null;
  const category = EXPENSE_CATEGORIES.find((c) => q.includes(c.toLowerCase().split(" ")[0])) ?? null;
  const below = /(?:less than|under|below|<)\s*₹?\s*(\d+)/.exec(q);
  const above = /(?:more than|over|above|>)\s*₹?\s*(\d+)/.exec(q);
  const name = extractName(question);
  const r = (tool: Tool, extra: Partial<Route> = {}): Route => ({ ...EMPTY, language, tool, ...extra });

  if (/money update|ledger|accounts|where (did|does) the money|update (for|to) the group/.test(q)) return r("money_update");
  if (/remind|nudge/.test(q)) return name ? r("personal_reminder", { name }) : r("group_reminder");
  if (/spen[dt]|spnd|expense|bill|cost/.test(q) || (category && !/paid|pay/.test(q))) return r("spending", { category });
  if (/(not|n't|nt|yet to|still|pending|bacha|baaki|unpaid|missing|left)\b.*\bpa(y|id)|unpaid|who('s| is)? (left|missing|pending)|bacha|baaki/.test(q))
    return r("unpaid");
  if (name && /why|flag|detail|status|did|has|paid/.test(q)) return r("payment_detail", { name });
  if (/review|flag|verified|rejected|paid|payment|contribut/.test(q) || below || above) {
    const status = /review|flag/.test(q) ? "needs_review" : /rejected/.test(q) ? "rejected" : /verified/.test(q) ? "verified" : null;
    return r("payments", {
      status,
      maxAmount: below ? Math.max(0, +below[1] - 1) : null,
      minAmount: above ? +above[1] + 1 : null,
    });
  }
  if (/summary|how much|total|collected|balance|status|overview|progress|how are we/.test(q)) return r("summary");
  return r("help");
}
