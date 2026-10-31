"use client";

import type { Event } from "@prisma/client";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { updateEventDetails } from "../actions";

export function EventDetailsForm({ event }: { event: Pick<Event, "id" | "startTime" | "venue" | "notes"> }) {
  const [state, action] = useActionState(updateEventDetails.bind(null, event.id), undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[140px_1fr]">
      <div>
        <label className="label" htmlFor="startTime">Starts at</label>
        <input id="startTime" name="startTime" type="time" className="input" defaultValue={event.startTime ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="venue">Venue</label>
        <input id="venue" name="venue" className="input" defaultValue={event.venue ?? ""} placeholder="Clubhouse, Tower B, Prestige Lakeside" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Note for people who&apos;ve paid</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={500}
          className="input"
          defaultValue={event.notes ?? ""}
          placeholder="Dinner from 8 pm. Bring your own diyas. Kids' rangoli contest at 7."
        />
      </div>
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Saving…">Save details</SubmitButton>
      </div>
    </form>
  );
}
