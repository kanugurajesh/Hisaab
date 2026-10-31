"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import { createEvent } from "./actions";

export function CreateEventForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(createEvent, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">Event name</label>
        <input id="name" name="name" className="input" placeholder="Diwali 2026 – Tower B" required />
      </div>
      <div>
        <label className="label" htmlFor="date">Event date</label>
        <input id="date" name="date" type="date" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="perHeadAmount">Per-head contribution (₹)</label>
        <input id="perHeadAmount" name="perHeadAmount" type="number" min={1} className="input" placeholder="500" required />
      </div>
      <div>
        <label className="label" htmlFor="organizerUpiVpa">Your UPI ID</label>
        <input id="organizerUpiVpa" name="organizerUpiVpa" className="input" placeholder="ravi.kumar@okicici" required />
      </div>
      <div>
        <label className="label" htmlFor="organizerName">Name on your UPI account</label>
        <input id="organizerName" name="organizerName" className="input" defaultValue={defaultName} required />
      </div>
      <div>
        <label className="label" htmlFor="dueDate">
          Pay by <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="dueDate" name="dueDate" type="date" className="input" />
      </div>
      <div className="flex items-end justify-between gap-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Creating…">Create collection</SubmitButton>
      </div>
    </form>
  );
}
