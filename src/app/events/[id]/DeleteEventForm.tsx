"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { deleteEvent } from "../actions";

export function DeleteEventForm({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [state, action] = useActionState(deleteEvent.bind(null, eventId), undefined);
  const [confirm, setConfirm] = useState("");
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="confirm">
          Type <span className="font-semibold">{eventName}</span> to confirm
        </label>
        <input id="confirm" name="confirm" className="input" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <SubmitButton className="btn bg-rose-600 text-white hover:bg-rose-700" pendingText="Deleting…" disabled={confirm.trim() !== eventName}>
          Delete collection
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
