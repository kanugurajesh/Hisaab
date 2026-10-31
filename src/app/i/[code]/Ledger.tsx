import type { Event } from "@prisma/client";
import { prisma } from "@/lib/db";
import { summarizeExpenses } from "@/lib/expenses/ledger";
import { inr, shortDate } from "@/lib/format";
import { getEventStats } from "@/lib/services/stats";

/** The shared view of collected vs. spent that every group member can open. */
export async function Ledger({ event }: { event: Event }) {
  const [stats, expenses] = await Promise.all([
    getEventStats(event.id),
    prisma.expense.findMany({ where: { eventId: event.id }, orderBy: [{ billDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] }),
  ]);
  if (!stats.registrations && !expenses.length) return null;
  const { total, byCategory, billCoverage } = summarizeExpenses(expenses);
  const balance = stats.collected - total;
  const closed = event.status === "CLOSED";

  return (
    <section id="ledger" className="card scroll-mt-4">
      <h2 className="font-semibold">{closed ? "Where the money went" : "Where the money goes"}</h2>
      <p className="text-xs text-slate-500">Kept by {event.organizerName}. Everyone in the group sees the same numbers.</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Collected</dt>
          <dd className="tabular font-display font-extrabold">{inr(stats.collected)}</dd>
          <dd className="text-[11px] text-slate-400">{stats.registrations} people</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">Spent</dt>
          <dd className="tabular font-display font-extrabold">{inr(total)}</dd>
          <dd className="text-[11px] text-slate-400">{expenses.length} items</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="text-xs text-slate-500">{balance >= 0 ? "Balance" : "Shortfall"}</dt>
          <dd className={`tabular font-display font-extrabold ${balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{inr(Math.abs(balance))}</dd>
          <dd className="text-[11px] text-slate-400">{closed ? "final" : "so far"}</dd>
        </div>
      </dl>

      {byCategory.length > 0 && (
        <ul className="mt-4 space-y-1.5" aria-label="Spending by category">
          {byCategory.map(([cat, amt]) => (
            <li key={cat} className="text-xs">
              <div className="flex justify-between">
                <span>{cat}</span>
                <span className="text-slate-500">{inr(amt)}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full origin-left animate-fill rounded-full bg-brand-500" style={{ width: `${Math.max(2, (amt / total) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {expenses.length > 0 && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 text-sm" aria-label="Expenses">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{e.title}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {[e.vendor, e.category, shortDate(e.billDate ?? e.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {inr(e.amount)}
                  {e.receiptKey ? (
                    <a href={`/api/receipts/${e.id}?c=${event.inviteCode}`} target="_blank" rel="noreferrer" className="badge bg-emerald-50 text-emerald-700">
                      View bill
                    </a>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-500">No bill</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {billCoverage !== null && (
            <p className="mt-2 text-xs text-slate-500">
              {billCoverage === 1 ? "Every rupee spent has a bill attached." : `Bills attached for ${Math.round(billCoverage * 100)}% of the money spent.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
