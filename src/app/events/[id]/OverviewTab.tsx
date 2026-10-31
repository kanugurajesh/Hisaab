import type { Event } from "@prisma/client";
import Link from "next/link";
import QRCode from "qrcode";
import { CopyButton } from "@/components/forms";
import { Progress, Stat, VerificationBadge } from "@/components/ui";
import { prisma } from "@/lib/db";
import { inr, relativeTime } from "@/lib/format";
import { getEventStats, getReminderFunnel } from "@/lib/services/stats";
import { inviteUrl } from "../actions";
import { EventDetailsForm } from "./EventDetailsForm";

type Stats = Awaited<ReturnType<typeof getEventStats>>;

export async function OverviewTab({ event, stats }: { event: Event; stats: Stats }) {
  const link = await inviteUrl(event.inviteCode);
  const [qr, funnel, recent, ai] = await Promise.all([
    QRCode.toDataURL(link, { margin: 1, width: 320 }),
    getReminderFunnel(event.id),
    prisma.contribution.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.aiCall.aggregate({ where: { eventId: event.id }, _count: true, _avg: { latencyMs: true }, _sum: { inputTokens: true, outputTokens: true } }),
  ]);
  // gpt-oss-120b on Groq: $0.15 / 1M input, $0.60 / 1M output tokens.
  const aiCostUsd = ((ai._sum.inputTokens ?? 0) * 0.15 + (ai._sum.outputTokens ?? 0) * 0.6) / 1e6;

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Collection progress</h2>
          <span className="text-sm text-slate-500">
            {inr(stats.collected)} of {stats.expected ? inr(stats.expectedAmount) : "—"}
          </span>
        </div>
        {stats.expected ? (
          <>
            <Progress value={stats.collectionRate ?? 0} />
            <p className="mt-2 text-sm text-slate-600">
              <b>{stats.paid}</b> of <b>{stats.expected}</b> group members paid
              {stats.suggested > 0 && <> · {stats.suggested} likely paid (confirm)</>}
              {stats.missing > 0 && (
                <>
                  {" · "}
                  <Link href="?tab=roster" className="font-medium text-amber-700 underline">
                    {stats.missing} still to pay
                  </Link>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Hisaab only knows who has registered. <Link href="?tab=roster" className="font-medium text-brand-700 underline">Import your WhatsApp group</Link>{" "}
            to see who hasn&apos;t paid yet.
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={inr(stats.collected)} hint={`${stats.registrations} registrations`} />
        <Stat label="Verified" value={`${stats.verified}`} hint="by AI or by you" tone="good" />
        <Stat label="To review" value={`${stats.needsReview}`} hint="screenshots that look off" tone={stats.needsReview ? "warn" : "default"} />
        <Stat label="Balance" value={inr(stats.balance)} hint={`${inr(stats.spent)} spent`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Invite link</h2>
          <p className="mt-1 text-sm text-slate-500">Share this in your group. People pay you by UPI, then register here with their screenshot.</p>
          <div className="mt-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Invite QR code" className="h-28 w-28 rounded-lg border border-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <code className="block truncate rounded-lg bg-slate-100 px-2 py-1.5 text-xs">{link}</code>
              <CopyButton text={link} label="Copy link" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold">Hisaab impact</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs text-slate-500">Reminders sent</dt>
              <dd className="text-xl font-semibold">{funnel.sent}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">People nudged</dt>
              <dd className="text-xl font-semibold">{funnel.peopleNudged}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Paid after nudge</dt>
              <dd className="text-xl font-semibold text-emerald-600">
                {funnel.converted}
                {funnel.peopleNudged > 0 && <span className="text-sm text-slate-400"> ({Math.round((funnel.converted / funnel.peopleNudged) * 100)}%)</span>}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {ai._count} AI calls · avg {Math.round(ai._avg.latencyMs ?? 0)} ms · ≈ ${aiCostUsd.toFixed(4)} total
          </p>
        </section>
      </div>

      <section className="card">
        <h2 className="font-semibold">Event details</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          Once their payment is confirmed, people get these with a receipt they can show at the door, plus Add to calendar and directions.
        </p>
        <EventDetailsForm event={event} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Latest registrations</h2>
        {recent.length ? (
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">
                  {c.name} <span className="text-slate-400">· {relativeTime(c.createdAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {inr(c.amount)} <VerificationBadge status={c.verificationStatus} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No one has registered yet.</p>
        )}
      </section>
    </div>
  );
}
