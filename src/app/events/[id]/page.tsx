import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireEvent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { getEventStats } from "@/lib/services/stats";
import { CloseTab } from "./CloseTab";
import { ExpensesTab } from "./ExpensesTab";
import { OverviewTab } from "./OverviewTab";
import { ReviewTab } from "./ReviewTab";
import { RosterTab } from "./RosterTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "roster", label: "Who hasn't paid" },
  { id: "review", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "close", label: "Close" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "overview";
  const event = await requireEvent(id);
  const stats = await getEventStats(id);
  const [reviewCount, flaggedExpenses] = await Promise.all([
    prisma.contribution.count({ where: { eventId: id, verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED"] } } }),
    prisma.expense.count({ where: { eventId: id, flagged: true } }),
  ]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{event.name}</h1>
            {event.status === "CLOSED" && <span className="badge bg-slate-100 text-slate-600">Closed</span>}
          </div>
          <p className="text-sm text-slate-500">
            {shortDate(event.date)} · {inr(event.perHeadAmount)} per head · pays to {event.organizerUpiVpa}
          </p>
        </div>
        <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4" aria-label="Sections">
          {TABS.map((t) => {
            const badge = t.id === "roster" ? stats.missing : t.id === "review" ? reviewCount : t.id === "expenses" ? flaggedExpenses : 0;
            return (
              <Link
                key={t.id}
                href={`?tab=${t.id}`}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                {badge > 0 && <span className="badge bg-amber-100 text-amber-800">{badge}</span>}
              </Link>
            );
          })}
        </nav>
        {tab === "overview" && <OverviewTab event={event} stats={stats} />}
        {tab === "roster" && <RosterTab event={event} stats={stats} />}
        {tab === "review" && <ReviewTab event={event} />}
        {tab === "expenses" && <ExpensesTab event={event} />}
        {tab === "close" && <CloseTab event={event} stats={stats} />}
      </main>
    </>
  );
}
