import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SubmitButton } from "@/components/forms";
import { requireEvent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { getEventStats } from "@/lib/services/stats";
import { startNextMonth } from "../actions";
import { AssistantPanel } from "./AssistantPanel";
import { CloseTab } from "./CloseTab";
import { ExpensesTab } from "./ExpensesTab";
import { OverviewTab } from "./OverviewTab";
import { ReviewTab } from "./ReviewTab";
import { RosterTab } from "./RosterTab";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "roster", label: "Who hasn't paid" },
  { id: "review", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "close", label: "Close" },
  { id: "ask", label: "Ask ✨" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "overview";
  const event = await requireEvent(id);
  const stats = await getEventStats(id);
  const [reviewCount, flaggedExpenses, fund, laterMonth] = await Promise.all([
    prisma.contribution.count({ where: { eventId: id, verificationStatus: { in: ["NEEDS_REVIEW", "UNVERIFIED"] } } }),
    prisma.expense.count({ where: { eventId: id, flagged: true } }),
    event.fundId ? prisma.fund.findUnique({ where: { id: event.fundId } }) : null,
    event.fundId && event.period ? prisma.event.findFirst({ where: { fundId: event.fundId, period: { gt: event.period } }, select: { id: true } }) : null,
  ]);

  const badges: Partial<Record<TabId, number>> = { roster: stats.missing, review: reviewCount, expenses: flaggedExpenses };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 animate-enter">
          {fund && (
            <Link href={`/funds/${fund.id}`} className="text-sm text-slate-500 hover:text-brand-700">
              ← {fund.name} · all months
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-tight font-extrabold sm:text-3xl">{event.name}</h1>
            {event.status === "CLOSED" && <span className="badge bg-slate-100 text-slate-600">Closed</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {shortDate(event.date)} · <span className="tabular">{inr(event.perHeadAmount)}</span> per head · pays to{" "}
            <span className="font-medium text-slate-700">{event.organizerUpiVpa}</span>
          </p>
          {fund && !laterMonth && (
            <form action={startNextMonth.bind(null, event.id)} className="mt-3">
              <SubmitButton className="btn-secondary text-sm" pendingText="Copying members…">
                Start next month
              </SubmitButton>
            </form>
          )}
        </div>
        <Tabs tabs={TABS.map((t) => ({ ...t, badge: badges[t.id] ?? 0 }))} active={tab}>
          {tab === "overview" && <OverviewTab event={event} stats={stats} />}
          {tab === "roster" && <RosterTab event={event} stats={stats} />}
          {tab === "review" && <ReviewTab event={event} />}
          {tab === "expenses" && <ExpensesTab event={event} />}
          {tab === "close" && <CloseTab event={event} stats={stats} />}
          {tab === "ask" && <AssistantPanel eventId={event.id} perHead={event.perHeadAmount} />}
        </Tabs>
      </main>
    </>
  );
}
