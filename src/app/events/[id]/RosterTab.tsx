import type { Event } from "@prisma/client";
import { SubmitButton } from "@/components/forms";
import { Empty, RosterBadge, VerificationBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { inr, relativeTime } from "@/lib/format";
import { earlierMisses, monthLabel } from "@/lib/funds/months";
import { loadFundGrid } from "@/lib/services/funds";
import type { getEventStats } from "@/lib/services/stats";
import { resolveSuggestion, setExcluded } from "../actions";
import { GroupNudge, RemindPanel } from "./RemindPanel";
import { AddMemberForm, RosterImport } from "./RosterImport";

type Stats = Awaited<ReturnType<typeof getEventStats>>;

export async function RosterTab({ event, stats }: { event: Event; stats: Stats }) {
  const roster = await prisma.rosterMember.findMany({
    where: { eventId: event.id },
    orderBy: { displayName: "asc" },
    include: {
      contribution: { select: { name: true, amount: true, verificationStatus: true } },
      reminders: { where: { sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 1 },
      _count: { select: { reminders: { where: { sentAt: { not: null } } } } },
    },
  });
  const unclaimed = await prisma.contribution.count({ where: { eventId: event.id, rosterMember: null, verificationStatus: { not: "REJECTED" } } });
  const group = (s: string) => roster.filter((r) => r.status === s);
  const [missing, suggested, paid, excluded] = [group("PENDING"), group("SUGGESTED"), group("MATCHED"), group("EXCLUDED")];
  // In a monthly fund: who also missed the months right before this one.
  const alsoMissed =
    event.fundId && event.period && missing.length
      ? earlierMisses(
          await loadFundGrid(event.fundId, new Date(), { upTo: event.period, people: missing.map((m) => m.personKey ?? m.id) }),
          event.period,
        )
      : new Map<string, string[]>();

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="font-semibold">{roster.length ? "Add more people" : "Who is expected to pay?"}</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          WhatsApp → group → ⋮ → More → <b>Export chat</b> (without media), then upload the .txt. Only member names and numbers are kept; messages
          are discarded before anything reaches the AI.
        </p>
        <RosterImport eventId={event.id} />
      </section>

      {roster.length === 0 ? (
        <Empty title="No roster yet">Import your group to see exactly who hasn&apos;t paid.</Empty>
      ) : (
        <>
          <section className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Not paid yet · {missing.length}</h2>
                <p className="text-sm text-slate-500">{inr(missing.length * event.perHeadAmount)} outstanding</p>
              </div>
              {missing.length > 0 && <GroupNudge eventId={event.id} />}
            </div>
            {missing.length ? (
              <ul className="divide-y divide-slate-100">
                {missing.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.displayName}</div>
                        <div className="text-xs text-slate-500">
                          {m.phone ?? "No phone number"}
                          {m.reminders[0]?.sentAt && ` · reminded ${m._count.reminders}× · last ${relativeTime(m.reminders[0].sentAt)}`}
                          {m.matchReason && ` · ${m.matchReason}`}
                        </div>
                        {alsoMissed.has(m.id) && (
                          <div className="text-xs font-medium text-amber-700">also missed {alsoMissed.get(m.id)!.map((p) => monthLabel(p, true)).join(", ")}</div>
                        )}
                      </div>
                      <form action={setExcluded.bind(null, m.id, true)}>
                        <SubmitButton className="btn-ghost text-xs" pendingText="…">
                          Not expected
                        </SubmitButton>
                      </form>
                    </div>
                    <RemindPanel rosterId={m.id} attempts={m._count.reminders} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">Everyone on the roster has paid. 🎉</p>
            )}
          </section>

          {suggested.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">Likely paid · confirm {suggested.length}</h2>
              <p className="mb-2 text-sm text-slate-500">The AI thinks these are the same person but isn&apos;t sure enough to tick them off by itself.</p>
              <ul className="divide-y divide-slate-100">
                {suggested.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <b>{m.displayName}</b> <span className="text-slate-400">in group</span> = <b>{m.contribution?.name}</b>{" "}
                      <span className="text-slate-400">registered {m.contribution && inr(m.contribution.amount)}</span>
                      <div className="text-xs text-slate-500">
                        {Math.round((m.matchConfidence ?? 0) * 100)}% · {m.matchReason}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={resolveSuggestion.bind(null, m.id, true)}>
                        <SubmitButton className="btn-primary text-xs">Same person</SubmitButton>
                      </form>
                      <form action={resolveSuggestion.bind(null, m.id, false)}>
                        <SubmitButton className="btn-secondary text-xs">Different</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="mb-2 font-semibold">Paid · {paid.length}</h2>
            {unclaimed > 0 && (
              <p className="mb-2 text-sm text-slate-500">
                {unclaimed} registration{unclaimed > 1 ? "s" : ""} didn&apos;t match anyone in the group (guests, or names too different to match).
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {paid.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {m.displayName}
                    {m.contribution && m.contribution.name !== m.displayName && <span className="text-slate-400"> · registered as {m.contribution.name}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    <span className="hidden sm:inline">{m.matchReason}</span>
                    {m.contribution && !["VERIFIED", "APPROVED"].includes(m.contribution.verificationStatus) ? (
                      <VerificationBadge status={m.contribution.verificationStatus} />
                    ) : (
                      <RosterBadge status={m.status} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {excluded.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">Not expected to pay · {excluded.length}</summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {excluded.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {m.displayName} <span className="text-xs text-slate-400">· {m.matchReason}</span>
                    </span>
                    <form action={setExcluded.bind(null, m.id, false)}>
                      <SubmitButton className="btn-ghost text-xs">Include</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="card">
            <h2 className="mb-2 font-semibold">Add someone manually</h2>
            <AddMemberForm eventId={event.id} />
          </section>
        </>
      )}
      <p className="text-center text-xs text-slate-400">
        {stats.expected} expected · {stats.paid} paid · {stats.suggested} to confirm · {stats.missing} missing
      </p>
    </div>
  );
}
