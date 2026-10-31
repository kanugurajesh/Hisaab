"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "@/components/forms";
import { LANGUAGES, type Language } from "@/lib/reminders/constants";
import { draftGroupNudge, draftReminder, markReminderSent } from "../actions";

type Draft = Awaited<ReturnType<typeof draftReminder>>;

const TONE_LABEL = { friendly: "Friendly", firm: "Firm", final: "Final reminder" } as const;

export function RemindPanel({ rosterId, attempts }: { rosterId: string; attempts: number }) {
  const [language, setLanguage] = useState<Language>("en");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      const d = await draftReminder(rosterId, language);
      setDraft(d);
      setText(d.message);
      setSent(false);
    });

  const send = () => {
    if (!draft) return;
    // Open the tab synchronously so mobile browsers don't block it as a popup.
    const tab = window.open("", "_blank");
    start(async () => {
      const link = await markReminderSent(draft.reminderId, text);
      if (tab) tab.location.href = link;
      else window.location.href = link;
      setSent(true);
    });
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Reminder language"
          className="input w-auto py-1.5 text-xs"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary text-xs" onClick={generate} disabled={pending}>
          {pending && !draft ? "Writing…" : draft ? "Rewrite" : attempts ? `Write reminder #${attempts + 1}` : "✨ Write reminder"}
        </button>
      </div>
      {draft && (
        <div className="mt-2 animate-enter space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="badge bg-white text-slate-600">{TONE_LABEL[draft.tone]}</span>
            {draft.usedFallback && <span title="The AI draft failed our checks, so a safe template was used">template</span>}
          </div>
          <textarea className="input text-sm" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reminder message" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-whatsapp text-xs" onClick={send} disabled={pending || !text.trim()}>
              {sent ? "Sent ✓ Open again" : draft.phone ? "Open in WhatsApp" : "Open WhatsApp (pick chat)"}
            </button>
            <CopyButton text={text} className="btn-secondary text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

export function GroupNudge({ eventId }: { eventId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className="btn-secondary text-sm" disabled={pending} onClick={() => start(async () => setText(await draftGroupNudge(eventId)))}>
        {pending ? "Preparing…" : "Group message"}
      </button>
      {text && (
        <div className="w-full max-w-md animate-enter space-y-2 rounded-xl bg-slate-50 p-3">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{text}</pre>
          <div className="flex gap-2">
            <a className="btn-whatsapp text-xs" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              Share to group
            </a>
            <CopyButton text={text} className="btn-secondary text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}
