import type { Contribution, Event } from "@prisma/client";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatTime, googleCalendarUrl, mapsUrl } from "@/lib/calendar";
import { receiptPath } from "@/lib/contributionToken";
import { OutcomeIcon } from "@/components/ui";
import { inr, longDate, shortDate } from "@/lib/format";
import type { Check, CheckId } from "@/lib/verify/rules";

// Written for the contributor. The organizer's labels ("Amount matches what they
// entered") read like a pass when listed as a reason, and some details name other
// people ("Same image as Kiran's proof"), so they aren't shown here.
const REASONS: Record<CheckId, string> = {
  is_payment: "the screenshot doesn't look like a payment confirmation",
  readable: "the screenshot is hard to read",
  status_success: "the screenshot doesn't show a successful payment",
  amount_matches: "the amount on the screenshot is different from the amount you entered",
  amount_minimum: "the amount is less than the per-head contribution",
  payee_matches: "we couldn't confirm it was paid to the organizer's UPI ID",
  time_window: "the payment time on the screenshot is outside this collection",
  utr_format: "the UPI transaction ID isn't visible",
  utr_matches_entered: "the transaction ID you typed doesn't match the screenshot",
  utr_unique: "this transaction ID was already used for another registration",
  image_unique: "this screenshot was already used for another registration",
};

function reasons(c: Contribution): string[] {
  const checks = (c.checks as Check[] | null) ?? [];
  if (checks.length) return checks.filter((ch) => !ch.pass).map((ch) => REASONS[ch.id]);
  return [c.proofKey ? "we couldn't read the screenshot" : "no screenshot was attached"];
}

export function PaymentStatus({ contribution: c, event }: { contribution: Contribution; event: Event }) {
  const s = c.verificationStatus;
  const confirmed = s === "VERIFIED" || s === "APPROVED";
  const rejected = s === "REJECTED";
  const waiting = !confirmed && !rejected;
  const why = waiting ? reasons(c) : [];
  const { organizerName } = event;

  return (
    <section className="card space-y-4">
      {waiting && <AutoRefresh />}
      <div className={`rounded-2xl p-5 text-center ${confirmed ? "bg-emerald-50" : rejected ? "bg-rose-50" : "bg-amber-50"}`} role="status">
        <OutcomeIcon outcome={confirmed ? "confirmed" : rejected ? "rejected" : "waiting"} />
        <h2 className="mt-3 text-lg leading-snug font-semibold text-balance">
          {s === "VERIFIED"
            ? "Payment verified. Thank you!"
            : s === "APPROVED"
              ? `${organizerName} confirmed your payment. Thank you!`
              : rejected
                ? `${organizerName} couldn't confirm this payment.`
                : "Registered! The organizer will confirm your payment."}
        </h2>
        <p className="tabular mt-1 text-sm text-slate-600">
          {c.name} · {inr(c.amount)} · registered {shortDate(c.createdAt)}
        </p>
        {why.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            We couldn&apos;t verify it automatically: {why.join("; ")}. No action needed unless you entered something wrong.
          </p>
        )}
        {waiting && (
          <p className="mt-2 text-xs text-slate-500">This page updates by itself. Your receipt and the event details appear here once it&apos;s confirmed.</p>
        )}
        {rejected && (
          <p className="mt-2 text-sm text-rose-800">If you did pay, message {organizerName} with your UPI transaction ID, or register the payment again.</p>
        )}
        {confirmed && (
          <Link href={receiptPath(c.id)} className="btn-primary mt-4 w-full py-2.5">
            View receipt
          </Link>
        )}
      </div>

      {confirmed && (
        <div className="animate-enter [animation-delay:350ms]">
          <EventDetails event={event} />
        </div>
      )}

      <p className="text-center text-sm">
        <Link href="?new=1" className="text-brand-700 underline">
          {rejected ? "Register the payment again" : "Paying for someone else too? Register another payment"}
        </Link>
      </p>
    </section>
  );
}

/** What a paid contributor needs next: when, where, and anything the organizer wants them to know. */
function EventDetails({ event }: { event: Event }) {
  const time = formatTime(event.startTime);
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-semibold">You&apos;re all set for {event.name}</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt aria-label="When">📅</dt>
          <dd>
            {longDate(event.date)}
            {time && `, ${time}`}
          </dd>
        </div>
        {event.venue && (
          <div className="flex gap-2">
            <dt aria-label="Where">📍</dt>
            <dd>{event.venue}</dd>
          </div>
        )}
        {event.notes && (
          <div className="flex gap-2">
            <dt aria-label={`Note from ${event.organizerName}`}>📝</dt>
            <dd className="whitespace-pre-line">{event.notes}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
          Add to Google Calendar
        </a>
        <a href={`/i/${event.inviteCode}/event.ics`} className="btn-secondary text-xs">
          Apple / Outlook calendar
        </a>
        {event.venue && (
          <a href={mapsUrl(event.venue)} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
            Directions
          </a>
        )}
      </div>
    </div>
  );
}
