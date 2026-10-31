import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Empty } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { CreateEventForm } from "./CreateEventForm";

export default async function EventsPage() {
  const user = await requireOrganizer();
  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contributions: true, roster: { where: { status: "PENDING" } } } } },
  });

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section>
          <h1 className="mb-3 text-xl font-semibold">Your collections</h1>
          {events.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} className="card transition hover:border-brand-500">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{e.name}</div>
                    <span className={`badge ${e.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {e.status === "OPEN" ? "Collecting" : "Closed"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {shortDate(e.date)} · {inr(e.perHeadAmount)} per head
                  </div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span>{e._count.contributions} registered</span>
                    {e._count.roster > 0 && <span className="text-amber-700">{e._count.roster} not paid yet</span>}
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
