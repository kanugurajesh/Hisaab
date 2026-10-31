"use client";

import { useActionState, useState, useTransition } from "react";
import { CopyButton, FormMessage, SubmitButton } from "@/components/forms";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { addExpense, draftLedgerUpdate } from "../actions";

export function ExpenseForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(addExpense.bind(null, eventId), undefined);
  const [hasBill, setHasBill] = useState(false);
  const optional = hasBill ? <span className="font-normal text-slate-400">(from bill)</span> : null;
  return (
    <form action={action} className="space-y-3" onReset={() => setHasBill(false)}>
      <div>
        <label className="label" htmlFor="bill">
          Bill or receipt <span className="font-normal text-slate-400">(recommended)</span>
        </label>
        <input
          id="bill"
          name="bill"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="input py-1.5 text-sm"
          onChange={(e) => setHasBill(!!e.target.files?.length)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Snap the bill and leave the rest blank: AI reads the shop, total, date and category, and checks the arithmetic. Everyone with the invite link can
          see the bill.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="title">What for {optional}</label>
          <input id="title" name="title" className="input" placeholder="Sweets from Ganesh Sweets" required={!hasBill} />
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount (₹) {optional}</label>
          <input id="amount" name="amount" type="number" min={1} className="input" required={!hasBill} />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" className="input" defaultValue="">
            <option value="">{hasBill ? "Auto (from bill)" : "Other"}</option>
            {EXPENSE_CATEGORIES.filter((c) => c !== "Other").map((c) => (
              <option key={c}>{c}</option>
            ))}
            {hasBill && <option value="Other">Other</option>}
          </select>
        </div>
        <SubmitButton pendingText={hasBill ? "Reading bill…" : undefined}>Add</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function LedgerShare({ eventId }: { eventId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className="btn-secondary text-sm" disabled={pending} onClick={() => start(async () => setText(await draftLedgerUpdate(eventId)))}>
        {pending ? "Preparing…" : "Share money update"}
      </button>
      {text && (
        <div className="w-full max-w-md space-y-2 rounded-xl bg-slate-50 p-3">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs" aria-label="Money update message">
            {text}
          </pre>
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
