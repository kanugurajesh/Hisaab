"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { addRosterMember, importRoster } from "../actions";

export function RosterImport({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(importRoster.bind(null, eventId), undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 hover:border-brand-500">
          <span className="font-medium">Upload WhatsApp chat export</span>
          <span className="text-xs text-slate-400">.txt from &quot;Export chat&quot;</span>
          <input type="file" name="file" accept=".txt,.csv,text/plain,text/csv" className="mt-2 w-full text-xs" />
        </label>
        <textarea
          name="text"
          rows={4}
          className="input"
          placeholder={"…or paste names / numbers, one per line\nRavi Kumar\n+91 98480 12345\nSita (302)"}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton pendingText="Reading group & matching…">Import & match</SubmitButton>
      </div>
    </form>
  );
}

export function AddMemberForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(addRosterMember.bind(null, eventId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" className="input max-w-56 flex-1" placeholder="Name" required />
      <input name="phone" className="input max-w-44 flex-1" placeholder="Phone (optional)" />
      <SubmitButton className="btn-secondary">Add</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
