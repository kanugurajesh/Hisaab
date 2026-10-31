"use server";

import type { Event } from "@prisma/client";
import {
  closestMatches,
  groupReminderAnswer,
  HELP,
  paymentDetailAnswer,
  paymentsAnswer,
  spendingAnswer,
  summaryAnswer,
  unpaidAnswer,
  whichOne,
  type AssistantAnswer,
} from "@/lib/assistant/answers";
import { routeQuestion, type Route, type Tool } from "@/lib/assistant/route";
import { requireEvent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { groupNudgeFor, ledgerUpdateFor } from "@/lib/services/drafts";
import { getEventStats } from "@/lib/services/stats";
import { draftReminder } from "../actions";

export type AssistantReply = { ok: true; tool: Tool; answer: AssistantAnswer } | { ok: false; error: string };

const MAX_QUESTION = 300;

export async function askAssistant(eventId: string, earlier: string[], question: string): Promise<AssistantReply> {
  const event = await requireEvent(eventId);
  const q = question.trim().slice(0, MAX_QUESTION);
  if (!q) return { ok: false, error: "Ask me something about this collection." };
  if (!rateLimit(`assistant:${eventId}`, 30, 10 * 60_000)) return { ok: false, error: "That's a lot of questions. Give it a few minutes." };

  const route = await routeQuestion(q, earlier.map((e) => e.slice(0, MAX_QUESTION)).slice(-3), eventId);
  return { ok: true, tool: route.tool, answer: await run(event, route) };
}

async function run(event: Event, r: Route): Promise<AssistantAnswer> {
  const eventId = event.id;
  switch (r.tool) {
    case "summary":
      return summaryAnswer(await getEventStats(eventId));

    case "unpaid":
      return unpaidAnswer(
        await prisma.rosterMember.findMany({ where: { eventId, status: { not: "EXCLUDED" } }, orderBy: { displayName: "asc" }, select: { displayName: true, status: true } }),
      );

    case "payments":
      return paymentsAnswer(await prisma.contribution.findMany({ where: { eventId } }), r);

    case "payment_detail": {
      if (!r.name) return { text: "Whose payment should I look up? Ask like “why was Rahul flagged?”" };
      const [payments, members] = await Promise.all([
        prisma.contribution.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } }),
        prisma.rosterMember.findMany({ where: { eventId }, select: { displayName: true, status: true } }),
      ]);
      const paid = closestMatches(r.name, payments, (p) => p.name);
      const listed = closestMatches(r.name, members, (m) => m.displayName);
      const options = paid.length ? paid.map((p) => p.name) : listed.map((m) => m.displayName);
      if (options.length > 1) return whichOne(options, (n) => `Has ${n} paid?`);
      return paymentDetailAnswer(r.name, paid[0] ?? null, listed[0] ?? null);
    }

    case "spending":
      return spendingAnswer(await prisma.expense.findMany({ where: { eventId }, orderBy: { createdAt: "desc" } }), r.category);

    case "group_reminder": {
      const pending = await prisma.rosterMember.count({ where: { eventId, status: "PENDING" } });
      return groupReminderAnswer(pending ? await groupNudgeFor(event) : "", pending);
    }

    case "personal_reminder": {
      if (!r.name) return { text: "Who should I write the reminder for? Ask like “remind Anil in Telugu”." };
      const members = await prisma.rosterMember.findMany({ where: { eventId, status: { not: "EXCLUDED" } } });
      const found = closestMatches(r.name, members, (x) => x.displayName);
      const lang = r.language && r.language !== "en" ? ` in ${{ hi: "Hindi", te: "Telugu" }[r.language]}` : "";
      if (found.length > 1) return whichOne(found.map((x) => x.displayName), (n) => `Remind ${n}${lang}`);
      const m = found[0];
      if (!m) return { text: `I couldn't find "${r.name}" on your group list.`, link: { href: "?tab=roster", label: "Open Who hasn't paid" } };
      if (m.status === "MATCHED") return { text: `${m.displayName} has already paid, so there's nothing to remind them about.` };
      // Same flow as the "Write reminder" button: tone escalates with each reminder sent.
      const d = await draftReminder(m.id, r.language ?? "en");
      return {
        text: `Reminder ${d.attempt} for ${m.displayName} (${d.tone} tone${d.usedFallback ? ", from the template" : ""}). It has their personal link. Nothing is sent until you open WhatsApp.`,
        draft: { text: d.message, phone: d.phone, reminderId: d.reminderId },
      };
    }

    case "money_update":
      return { text: "Here's the money update for the group, with the link to every bill.", draft: { text: await ledgerUpdateFor(event) } };

    case "help":
      return HELP;
  }
}
