import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Empty } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { monthLabel } from "@/lib/funds/months";
import { CreateEventForm } from "./CreateEventForm";

export default async function EventsPage() {
  const user = await requireOrganizer();
  const include = { fund: true, _count: { select: { contributions: true, roster: { where: { status: "PENDING" as const } } } } };
  // A monthly fund shows once, as its latest month, and opens the fund page.
  const [single, funds] = await Promise.all([
    prisma.event.findMany({ where: { organizerId: user.id, fundId: null }, include }),
    prisma.fund.findMany({ where: { organizerId: user.id }, include: { months: { orderBy: { period: "desc" }, take: 1, include } } }),
  ]);
  const events = [...single, ...funds.flatMap((f) => f.months)].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <section>
          <h1 className="mb-4 text-2xl font-extrabold sm:text-3xl">Your collections</h1>
          {events.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((e, i) => (
                <Link
                  key={e.id}
                  href={e.fund ? `/funds/${e.fund.id}` : `/events/${e.id}`}
                  className="card group animate-enter transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_10px_30px_-12px_rgb(29_27_87/0.25)]"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-lg leading-snug font-semibold group-hover:text-brand-700">{e.fund?.name ?? e.name}</div>
                    {e.fund ? (
                      <span className="badge bg-brand-50 text-brand-700">Monthly</span>
                    ) : (
                      <span className={`badge ${e.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {e.status === "OPEN" ? "Collecting" : "Closed"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {e.period ? monthLabel(e.period) : shortDate(e.date)} · <span className="tabular">{inr(e.perHeadAmount)}</span>{" "}
                    {e.fund ? "a month" : "per head"}
                  </div>
                  <div className="tabular mt-4 flex gap-4 border-t border-slate-100 pt-3 text-sm">
                    <span>
                      <b className="font-semibold">{e._count.contributions}</b> registered
                    </span>
                    {e._count.roster > 0 && (
                      <span className="text-amber-700">
                        <b className="font-semibold">{e._count.roster}</b> not paid yet
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No collections yet">Create one below and share the invite link in your WhatsApp group.</Empty>
          )}
        </section>
        <section className="card">
          <h2 className="mb-4 font-semibold">New collection</h2>
          <CreateEventForm defaultName={user.name ?? ""} />
        </section>
      </main>
    </>
  );
}
