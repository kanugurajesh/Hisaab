import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SubmitButton } from "@/components/forms";
import { Empty, Stat } from "@/components/ui";
import { requireFund } from "@/lib/auth";
import { finishedMonths, monthLabel, periodOf, type Cell } from "@/lib/funds/months";
import { inr } from "@/lib/format";
import { getFundLedger, loadFundGrid } from "@/lib/services/funds";
import { startNextMonth } from "../../events/actions";

// The view a monthly organizer needs and a single month can't give: who paid
// which month, who keeps missing, and how much each person has paid this year.

const SHOWN_MONTHS = 12;

const CELL_STYLE: Record<Cell | "waiting", [string, string, string]> = {
  paid: ["✓", "bg-emerald-50 text-emerald-700", "Paid"],
  likely: ["?", "bg-sky-50 text-sky-700", "Likely paid, confirm"],
  unpaid: ["✗", "bg-amber-50 text-amber-800", "Not paid"],
  waiting: ["…", "text-slate-400", "Not paid yet (month still collecting)"],
  excluded: ["–", "text-slate-300", "Not expected to pay"],
  absent: ["", "", "Not in the group that month"],
};

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await requireFund(id);
  const now = new Date();
  const year = periodOf(now).slice(0, 4);
  const [{ months, rows, events }, ledger] = await Promise.all([loadFundGrid(fund.id, now), getFundLedger(fund.id, year)]);
  const latest = events.at(-1);
  if (!latest) return null;

  const spent = ledger.expenses.reduce((s, e) => s + e.amount, 0);
  const balance = ledger.collected - spent;
  // The per-person column only counts payments tied to someone on the roster;
  // the rest are waiting for the organizer to match or confirm them.
  const unmatched = ledger.collectedInYear - rows.reduce((s, r) => s + r.paidThisYear, 0);
  const finished = finishedMonths(months, now); // months after this are still collecting
  const collecting = months.slice(finished).map((m) => monthLabel(m.period));
  const behind = rows.filter((r) => r.missedInARow >= 2);
  const from = Math.max(0, months.length - SHOWN_MONTHS);
  const shown = months.slice(from);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <div className="animate-enter">
          <Link href="/events" className="text-sm text-slate-500 hover:text-brand-700">
            ← Collections
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-tight font-extrabold sm:text-3xl">{fund.name}</h1>
            <span className="badge bg-brand-50 text-brand-700">Monthly</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="tabular">{inr(latest.perHeadAmount)}</span> a month · pays to{" "}
            <span className="font-medium text-slate-700">{latest.organizerUpiVpa}</span> · {months.length} month{months.length > 1 ? "s" : ""} since{" "}
            {monthLabel(months[0].period)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/events/${latest.id}`} className="btn-primary">
              Open {monthLabel(latest.period!)}
            </Link>
            <form action={startNextMonth.bind(null, latest.id)}>
              <SubmitButton className="btn-secondary" pendingText="Copying members…">
                Start next month
              </SubmitButton>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Fund collected" value={inr(ledger.collected)} hint={`${ledger.payments} payments, all months`} />
          <Stat label="Spent" value={inr(spent)} hint={`${ledger.expenses.length} expenses`} />
          <Stat label={balance >= 0 ? "In the fund" : "Shortfall"} value={inr(Math.abs(balance))} tone={balance >= 0 ? "good" : "warn"} />
          <Stat
            label={`Collected in ${year}`}
            value={inr(ledger.collectedInYear)}
            hint={unmatched > 0 ? `${inr(unmatched)} not matched to a member yet` : "all matched to members"}
          />
        </div>

        <section className="card">
          <h2 className="font-semibold">Missed 2 or more months in a row · {behind.length}</h2>
          {behind.length ? (
            <>
              <p className="mb-2 text-sm text-slate-500">
                Counted up to the last finished month
                {collecting.length ? `; ${collecting.join(" and ")} ${collecting.length > 1 ? "are" : "is"} still collecting` : ""}.
              </p>
              <ul className="divide-y divide-slate-100 text-sm">
                {behind.map((r) => (
                  <li key={r.personKey} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-xs text-slate-500">
                        missed {r.missedPeriods.map((p) => monthLabel(p, true)).join(", ")} · {inr(r.paidThisYear)} paid in {year}
                      </span>
                    </span>
                    <span className="badge bg-amber-50 text-amber-800">{r.missedInARow} months</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Send reminders from{" "}
                <Link href={`/events/${latest.id}?tab=roster`} className="font-medium text-brand-700 underline">
                  {monthLabel(latest.period!)} · Who hasn&apos;t paid
                </Link>
                .
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-emerald-700">Nobody has missed two months in a row.</p>
          )}
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">Month by month</h2>
          <p className="mb-3 text-xs text-slate-500">
            ✓ paid · ? likely paid · ✗ not paid · … still collecting · – not expected to pay
            {from > 0 && ` · last ${SHOWN_MONTHS} months`}
          </p>
          {rows.length ? (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-max text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-white py-2 pr-3 font-medium">Person</th>
                    {shown.map((m, i) => (
                      <th key={m.id} className="px-1 py-2 text-center font-medium">
                        <Link href={`/events/${m.id}?tab=roster`} className="hover:text-brand-700">
                          {monthLabel(m.period, true)}
                          {(i === 0 || m.period.endsWith("-01")) && <span className="block text-[10px] text-slate-400">{m.period.slice(0, 4)}</span>}
                        </Link>
                      </th>
                    ))}
                    <th className="py-2 pl-3 text-right font-medium">{year}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.personKey}>
                      <td className="sticky left-0 z-10 max-w-40 truncate bg-white py-1.5 pr-3">{r.name}</td>
                      {r.cells.slice(from).map((c, j) => {
                        const isWaiting = c === "unpaid" && from + j >= finished;
                        const [sym, cls, title] = CELL_STYLE[isWaiting ? "waiting" : c];
                        return (
                          <td key={shown[j].id} className="px-1 py-1.5 text-center">
                            <span className={`inline-grid h-6 w-6 place-items-center rounded-md text-xs font-semibold ${cls}`} title={title} aria-label={title}>
                              {sym}
                            </span>
                          </td>
                        );
                      })}
                      <td className="tabular py-1.5 pl-3 text-right">{inr(r.paidThisYear)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No members yet">Add the group to {monthLabel(latest.period!)} and they&apos;ll carry over to every new month.</Empty>
          )}
        </section>
      </main>
    </>
  );
}
