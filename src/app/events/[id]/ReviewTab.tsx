import type { Event } from "@prisma/client";
import { SubmitButton } from "@/components/forms";
import { Empty, VerificationBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { inr, relativeTime } from "@/lib/format";
import type { ProofExtraction } from "@/lib/verify/extract";
import type { Check } from "@/lib/verify/rules";
import { reviewContribution } from "../actions";

const FIELDS: [keyof ProofExtraction, string][] = [
  ["amount", "Amount"],
  ["status", "Status"],
  ["payeeName", "Paid to"],
  ["payeeVpa", "Receiver UPI ID"],
  ["payerName", "Paid by"],
  ["utr", "UTR"],
  ["timestamp", "Time"],
  ["app", "App"],
];

export async function ReviewTab({ event }: { event: Event }) {
  const contributions = await prisma.contribution.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    include: { rosterMember: { select: { displayName: true } } },
  });
  const queue = contributions.filter((c) => c.verificationStatus === "NEEDS_REVIEW" || c.verificationStatus === "UNVERIFIED");

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-1 font-semibold">Review queue · {queue.length}</h2>
        <p className="mb-3 text-sm text-slate-500">
          The AI reads each screenshot; fixed rules decide. Anything that doesn&apos;t pass every check lands here. Nothing is rejected without you.
        </p>
        {queue.length === 0 ? (
          <Empty title="Nothing to review">Every payment with a screenshot has been verified.</Empty>
        ) : (
          <div className="space-y-4">
            {queue.map((c) => {
              const checks = (c.checks as Check[] | null) ?? [];
              const x = c.extracted as ProofExtraction | null;
              return (
                <article key={c.id} className="card grid gap-4 md:grid-cols-[180px_1fr]">
                  {c.proofKey ? (
                    <a href={`/api/proofs/${c.id}`} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/proofs/${c.id}`} alt={`Payment screenshot from ${c.name}`} className="max-h-80 w-full rounded-lg border border-slate-200 object-contain" />
                    </a>
                  ) : (
                    <div className="grid h-32 place-items-center rounded-lg bg-slate-100 text-sm text-slate-500">No screenshot</div>
                  )}
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {c.name} · {inr(c.amount)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.phone ?? "no phone"} · registered {relativeTime(c.createdAt)}
                          {c.rosterMember && ` · group member "${c.rosterMember.displayName}"`}
                        </div>
                      </div>
                      <VerificationBadge status={c.verificationStatus} />
                    </div>
                    {checks.length > 0 ? (
                      <ul className="grid gap-1 text-sm sm:grid-cols-2">
                        {checks.map((ch) => (
                          <li key={ch.id} className={ch.pass ? "text-slate-500" : "font-medium text-rose-700"}>
                            {ch.pass ? "✓" : "✗"} {ch.label}
                            {!ch.pass && <div className="text-xs font-normal text-rose-600">{ch.detail}</div>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">{c.proofKey ? "The AI couldn't read this screenshot. Please check it yourself." : "Registered without a screenshot (e.g. paid in cash)."}</p>
                    )}
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
                        </dl>
                      </details>
                    )}
                    <div className="flex gap-2">
                      <form action={reviewContribution.bind(null, c.id, true)}>
                        <SubmitButton>Approve</SubmitButton>
                      </form>
                      <form action={reviewContribution.bind(null, c.id, false)}>
                        <SubmitButton className="btn-secondary text-rose-700">Reject</SubmitButton>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">All payments · {contributions.length}</h2>
        {contributions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">UTR</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contributions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">{c.name}</td>
                    <td className="py-2 pr-3">{inr(c.amount)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{c.utr ?? "—"}</td>
                    <td className="py-2">
                      <VerificationBadge status={c.verificationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No payments yet.</p>
        )}
      </section>
    </div>
  );
}
