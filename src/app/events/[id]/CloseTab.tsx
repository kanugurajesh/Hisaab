import type { Event } from "@prisma/client";
import { SubmitButton } from "@/components/forms";
import { Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { summarizeExpenses } from "@/lib/expenses/ledger";
import { inr } from "@/lib/format";
import type { getEventStats } from "@/lib/services/stats";
import { setEventStatus } from "../actions";
import { DeleteEventForm } from "./DeleteEventForm";

type Stats = Awaited<ReturnType<typeof getEventStats>>;

export async function CloseTab({ event, stats }: { event: Event; stats: Stats }) {
  const contributions = await prisma.contribution.findMany({
    where: { eventId: event.id, verificationStatus: { not: "REJECTED" } },
    orderBy: { name: "asc" },
  });
  // Everyone shares expenses equally; whatever they paid above their share comes back.
  const share = contributions.length ? stats.spent / contributions.length : 0;
  const pendingReview = stats.needsReview;
  // People only register after paying. Rejected ones count too: they go away with the collection.
  const paid = await prisma.contribution.count({ where: { eventId: event.id } });
  const canDelete = event.status === "CLOSED" || paid === 0;
  const { billCoverage } = summarizeExpenses(await prisma.expense.findMany({ where: { eventId: event.id }, select: { amount: true, category: true, receiptKey: true } }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={inr(stats.collected)} />
        <Stat label="Spent" value={inr(stats.spent)} hint={billCoverage === null ? undefined : `${Math.round(billCoverage * 100)}% backed by bills`} />
        <Stat label={stats.balance >= 0 ? "Surplus" : "Shortfall"} value={inr(Math.abs(stats.balance))} tone={stats.balance >= 0 ? "good" : "warn"} />
        <Stat label="Share per person" value={inr(Math.round(share))} hint={`${contributions.length} contributors`} />
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Balance per person</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {contributions.map((c) => {
            const balance = Math.round(c.amount - share);
            return (
              <li key={c.id} className="flex justify-between py-2">
                <span>{c.name}</span>
                <span className={balance >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  {balance >= 0 ? `gets back ${inr(balance)}` : `owes ${inr(-balance)}`}
                </span>
              </li>
            );
          })}
          {!contributions.length && <li className="py-2 text-slate-500">No contributions yet.</li>}
        </ul>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {event.status === "OPEN"
            ? pendingReview
              ? `${pendingReview} payment${pendingReview > 1 ? "s" : ""} still need review. You can close anyway.`
              : "Closing stops new registrations from the invite link."
            : "This collection is closed. Contributors can still see the final accounts on the invite link."}
        </div>
        <form action={setEventStatus.bind(null, event.id, event.status === "OPEN" ? "CLOSED" : "OPEN")}>
          <SubmitButton className={event.status === "OPEN" ? "btn-primary" : "btn-secondary"}>
            {event.status === "OPEN" ? "Close collection" : "Reopen"}
          </SubmitButton>
        </form>
      </section>

      <section className="card border-rose-200">
        <h2 className="font-semibold text-rose-700">Delete collection</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">
          {canDelete
            ? "Permanently removes this collection, its registrations, payment screenshots, roster and reminders. This can't be undone."
            : "People have already paid. Settle the balances above and close the collection before deleting it."}
        </p>
        {canDelete && <DeleteEventForm eventId={event.id} eventName={event.name} />}
      </section>
    </div>
  );
}
