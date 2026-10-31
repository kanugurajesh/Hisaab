"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { register } from "./actions";

export function RegisterForm({ code, amount, nudgeToken, defaultName }: { code: string; amount: number; nudgeToken?: string; defaultName?: string }) {
  // On success the action redirects back to the invite page, which shows the payment's status.
  const [state, action] = useActionState(register.bind(null, code), undefined);

  return (
    <form action={action} className="space-y-3">
      {nudgeToken && <input type="hidden" name="r" value={nudgeToken} />}
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" defaultValue={defaultName} autoComplete="name" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="phone">WhatsApp number</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" className="input" placeholder="98480 12345" autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount paid (₹)</label>
          <input id="amount" name="amount" type="number" min={1} className="input" defaultValue={amount} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="proof">Payment screenshot</label>
        <input id="proof" name="proof" type="file" accept="image/png,image/jpeg,image/webp" className="input py-1.5 text-sm" />
        <p className="mt-1 text-xs text-slate-500">The success screen from GPay / PhonePe / Paytm. It&apos;s only visible to the organizer.</p>
      </div>
      <div>
        <label className="label" htmlFor="utr">
          UPI transaction ID <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="utr" name="utr" inputMode="numeric" className="input" placeholder="12-digit UTR / UPI Ref No." />
      </div>
      {state && !state.ok && (
        <p className="text-sm text-rose-600" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Checking your screenshot…">
        I&apos;ve paid, register me
      </SubmitButton>
    </form>
  );
}
