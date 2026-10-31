import type { Event, Expense } from "@prisma/client";
import { SubmitButton } from "@/components/forms";
import { Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import type { BillExtraction } from "@/lib/expenses/extract";
import { summarizeExpenses } from "@/lib/expenses/ledger";
import type { BillCheck } from "@/lib/expenses/rules";
import { inr, shortDate } from "@/lib/format";
import { clearExpenseFlag, deleteExpense } from "../actions";
import { ExpenseForm, LedgerShare } from "./ExpenseForm";

export async function ExpensesTab({ event }: { event: Event }) {
  const expenses = await prisma.expense.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } });
  const { total, byCategory, billCoverage } = summarizeExpenses(expenses);
  const flagged = expenses.filter((e) => e.flagged);

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="mb-3 font-semibold">Log an expense</h2>
        <ExpenseForm eventId={event.id} />
      </section>

      {flagged.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Worth a look · {flagged.length}</h2>
          <p className="mb-3 text-sm text-slate-500">
            These bills didn&apos;t pass every check. Only you see these flags. The group sees the bill itself on the shared ledger.
          </p>
          <div className="space-y-3">
            {flagged.map((e) => (
              <FlaggedExpense key={e.id} expense={e} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Spent" value={inr(total)} hint={`${expenses.length} expense${expenses.length === 1 ? "" : "s"}`} />
        <Stat
          label="Backed by bills"
          value={billCoverage === null ? "—" : `${Math.round(billCoverage * 100)}%`}
          hint="of the money spent"
          tone={billCoverage === null ? "default" : billCoverage >= 0.8 ? "good" : "warn"}
        />
        <div className="card col-span-2 flex flex-col justify-center gap-1 lg:col-span-1">
          <p className="text-xs text-slate-500">Tell the group where the money went, with a link to every bill.</p>
          <LedgerShare eventId={event.id} />
        </div>
      </div>

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Expenses</h2>
          <span className="text-sm font-medium">{inr(total)}</span>
        </div>
        {byCategory.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {byCategory.map(([cat, amt]) => (
              <span key={cat} className="badge bg-slate-100 text-slate-700">
                {cat} · {inr(amt)}
              </span>
            ))}
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">
                  {e.title}
                  {e.flagged && <span className="badge ml-1.5 bg-amber-50 text-amber-700">Check</span>}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {[e.vendor, e.category, shortDate(e.billDate ?? e.createdAt)].filter(Boolean).join(" · ")}
                  {e.receiptKey ? (
                    <>
                      {" · "}
                      <a href={`/api/receipts/${e.id}`} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                        bill
                      </a>
                    </>
                  ) : (
                    " · no bill"
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {inr(e.amount)}
                <form action={deleteExpense.bind(null, e.id)}>
                  <button type="submit" className="btn-ghost px-2 py-1 text-xs text-slate-400" aria-label={`Delete ${e.title}`}>
                    ✕
                  </button>
                </form>
              </span>
            </li>
          ))}
          {!expenses.length && <li className="py-2 text-sm text-slate-500">No expenses logged yet.</li>}
        </ul>
      </section>
    </div>
  );
}

const FIELDS: [keyof BillExtraction, string][] = [
  ["vendor", "Shop"],
  ["total", "Total"],
  ["tax", "Tax"],
  ["discount", "Discount"],
  ["date", "Date"],
  ["kind", "Type"],
];

function FlaggedExpense({ expense: e }: { expense: Expense }) {
  const checks = (e.checks as BillCheck[] | null) ?? [];
  const x = e.extracted as BillExtraction | null;
  return (
    <article className="card grid gap-4 md:grid-cols-[150px_1fr]">
      {e.receiptKey && (
        <a href={`/api/receipts/${e.id}`} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/receipts/${e.id}`} alt={`Bill for ${e.title}`} className="max-h-64 w-full rounded-lg border border-slate-200 object-contain" />
        </a>
      )}
      <div className="min-w-0 space-y-3">
        <div className="font-semibold">
          {e.title} · {inr(e.amount)}
        </div>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {checks.map((ch) => (
            <li key={ch.id} className={ch.pass ? "text-slate-500" : "font-medium text-rose-700"}>
              {ch.pass ? "✓" : "✗"} {ch.label}
              {!ch.pass && <div className="text-xs font-normal text-rose-600">{ch.detail}</div>}
            </li>
          ))}
        </ul>
        {x && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">What the AI read</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {FIELDS.map(([k, label]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="truncate">{String(x[k] ?? "—")}</dd>
                </div>
              ))}
              {x.items.length > 0 && (
                <>
                  <dt className="text-slate-500">Items</dt>
                  <dd>{x.items.map((i) => `${i.name} ${i.amount === null ? "" : inr(i.amount)}`).join(", ")}</dd>
                </>
              )}
            </dl>
          </details>
        )}
        <div className="flex gap-2">
          <form action={clearExpenseFlag.bind(null, e.id)}>
            <SubmitButton>Looks fine</SubmitButton>
          </form>
          <form action={deleteExpense.bind(null, e.id)}>
            <SubmitButton className="btn-secondary text-rose-700">Delete expense</SubmitButton>
          </form>
        </div>
      </div>
    </article>
  );
}
