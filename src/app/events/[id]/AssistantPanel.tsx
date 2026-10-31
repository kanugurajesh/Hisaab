"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CopyButton } from "@/components/forms";
import type { AssistantAnswer, Tone } from "@/lib/assistant/answers";
import { inr } from "@/lib/format";
import { whatsappLink } from "@/lib/reminders/whatsapp";
import { markReminderSent } from "../actions";
import { askAssistant } from "./assistantActions";

type Message = { role: "user"; text: string } | { role: "assistant"; answer: AssistantAnswer } | { role: "error"; text: string };

const TONE: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-rose-50 text-rose-700",
  muted: "bg-slate-100 text-slate-600",
};

export function AssistantPanel({ eventId, perHead }: { eventId: string; perHead: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const suggestions = [
    "Who hasn't paid yet?",
    "Which payments need my review?",
    `Who paid less than ${inr(perHead)}?`,
    "How much did we spend on food?",
    "Remind everyone who hasn't paid",
    "Write the money update for the group",
  ];

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    const earlier = messages.filter((m) => m.role === "user").map((m) => (m as { text: string }).text);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    start(async () => {
      try {
        const reply = await askAssistant(eventId, earlier, q);
        setMessages((m) => [...m, reply.ok ? { role: "assistant", answer: reply.answer } : { role: "error", text: reply.error }]);
      } catch {
        setMessages((m) => [...m, { role: "error", text: "Something went wrong. Please try again." }]);
      }
    });
  };

  return (
    <section className="card flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Ask about this collection</h2>
        <p className="text-sm text-slate-500">
          Answers come straight from your collection&apos;s data: the AI only decides what to look up. Drafts are never sent for you.
        </p>
      </div>

      {messages.length > 0 && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] origin-bottom-right animate-pop rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-sm text-white [animation-duration:220ms]">
                {m.text}
              </div>
            ) : m.role === "error" ? (
              <div key={i} className="w-fit max-w-[85%] animate-enter rounded-2xl rounded-bl-sm bg-rose-50 px-3.5 py-2 text-sm text-rose-700" role="alert">
                {m.text}
              </div>
            ) : (
              <Answer key={i} answer={m.answer} onAsk={ask} />
            ),
          )}
          {pending && (
            <div className="flex w-fit animate-enter items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-500">
              <span className="flex gap-1" aria-hidden>
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-typing rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
              Looking it up…
            </div>
          )}
          <div ref={end} />
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              className="btn-secondary animate-enter rounded-full text-xs hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              style={{ animationDelay: `${i * 35}ms` }}
              onClick={() => ask(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={300}
          placeholder="e.g. why was Rahul flagged? · remind Anil in Telugu"
          aria-label="Ask a question"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={pending || !input.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}

function Answer({ answer: a, onAsk }: { answer: AssistantAnswer; onAsk: (q: string) => void }) {
  // Help lists example questions: make them tappable.
  const examples = !a.draft && !a.link && a.items?.every((i) => !i.amount && !i.badge && !i.detail);
  return (
    <div className="max-w-[92%] animate-enter space-y-2 rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm" data-testid="assistant-answer">
      <p>{a.text}</p>
      {a.items && a.items.length > 0 && examples && (
        <div className="flex flex-wrap gap-1.5">
          {a.items.map((i) => (
            <button key={i.label} type="button" className="btn-secondary rounded-full px-2.5 py-1 text-xs" onClick={() => onAsk(i.label)}>
              {i.label}
            </button>
          ))}
        </div>
      )}
      {a.items && a.items.length > 0 && !examples && (
        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-xl bg-white px-3">
          {a.items.map((i, n) => (
            <li key={n} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate">{i.label}</span>
                {i.detail && <span className="block truncate text-xs text-slate-500">{i.detail}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {i.amount !== undefined && <span className="tabular font-medium">{inr(i.amount)}</span>}
                {i.badge && <span className={`badge ${TONE[i.badge.tone]}`}>{i.badge.text}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.draft && <Draft draft={a.draft} />}
      {a.link && (
        <Link href={a.link.href} className="inline-block text-xs font-medium text-brand-700 underline">
          {a.link.label} →
        </Link>
      )}
    </div>
  );
}

function Draft({ draft }: { draft: NonNullable<AssistantAnswer["draft"]> }) {
  const [text, setText] = useState(draft.text);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const open = () => {
    if (!draft.reminderId) {
      window.open(whatsappLink(draft.phone ?? null, text), "_blank");
      return;
    }
    // Personal reminders are recorded as sent, like the button on Who hasn't paid.
    // Open the tab synchronously so mobile browsers don't block it as a popup.
    const tab = window.open("", "_blank");
    const id = draft.reminderId;
    start(async () => {
      const link = await markReminderSent(id, text);
      if (tab) tab.location.href = link;
      else window.location.href = link;
      setSent(true);
    });
  };
  return (
    <div className="space-y-2">
      <textarea className="input bg-white text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Draft message" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-whatsapp text-xs" onClick={open} disabled={pending || !text.trim()}>
          {sent ? "Sent ✓ Open again" : draft.phone ? "Open in WhatsApp" : "Open WhatsApp (pick chat)"}
        </button>
        <CopyButton text={text} className="btn-secondary text-xs" />
      </div>
    </div>
  );
}
