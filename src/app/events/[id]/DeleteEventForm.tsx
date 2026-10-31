"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { matchesName } from "@/lib/format";
import { deleteEvent } from "../actions";

export function DeleteEventForm({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [state, action] = useActionState(deleteEvent.bind(null, eventId), undefined);
  const [confirm, setConfirm] = useState("");
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="confirm">
          Type <span className="font-semibold">{eventName}</span> to confirm
          <span className="block text-xs font-normal text-slate-500">Capitals and punctuation don&apos;t matter.</span>
        </label>
        <input id="confirm" name="confirm" className="input" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <SubmitButton className="btn bg-rose-600 text-white hover:bg-rose-700" pendingText="Deleting…" disabled={!matchesName(confirm, eventName)}>
          Delete collection
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
