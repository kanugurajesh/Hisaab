import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AutoRefresh, PrintButton } from "@/components/AutoRefresh";
import { Logo } from "@/components/ui";
import { formatTime } from "@/lib/calendar";
import { readContributionId, receiptNumber, receiptPath } from "@/lib/contributionToken";
import { prisma } from "@/lib/db";
import { inr, longDate, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Receipt · Hisaab", robots: { index: false } };

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

// The contributor's receipt. Its QR opens this same page, so at the door anyone
// can scan it and see the payment's status right now, not a screenshot of it.
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readContributionId(decodeURIComponent(token));
  const c = id ? await prisma.contribution.findUnique({ where: { id }, include: { event: true } }) : null;
  if (!c) notFound();
  const { event } = c;

  const s = c.verificationStatus;
  const confirmed = s === "VERIFIED" || s === "APPROVED";
  const rejected = s === "REJECTED";
  const url = `${appUrl()}${receiptPath(c.id)}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360 });
  const time = formatTime(event.startTime);

  const rows: [string, React.ReactNode][] = [
    ["Receipt no.", <span key="n" className="font-mono">{receiptNumber(c.id)}</span>],
    ["Paid by", c.name],
    ["Amount", <span key="a" className="font-semibold">{inr(c.amount)}</span>],
    ["For", event.name],
    ["Event", `${longDate(event.date)}${time ? `, ${time}` : ""}`],
    ...(event.venue ? ([["Venue", event.venue]] as [string, string][]) : []),
    ...(c.utr ? ([["UPI ref.", <span key="u" className="font-mono">{c.utr}</span>]] as [string, React.ReactNode][]) : []),
    ["Registered", shortDate(c.createdAt)],
    [
      "Confirmed",
      s === "APPROVED" ? `By ${event.organizerName}${c.reviewedAt ? `, ${shortDate(c.reviewedAt)}` : ""}` : s === "VERIFIED" ? "Screenshot verified automatically" : "—",
    ],
  ];

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6 print:max-w-none print:py-0">
      {!confirmed && !rejected && <AutoRefresh />}
      <Logo />
      <section className="card space-y-4 print:border-0 print:shadow-none">
        <div
          className={`rounded-2xl p-4 text-center ${confirmed ? "bg-emerald-50 text-emerald-800" : rejected ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}
          role="status"
        >
          <div className="text-xs font-medium uppercase tracking-wide">Contribution receipt</div>
          <div className="mt-1 text-lg font-semibold">
            {confirmed ? "✅ Paid" : rejected ? "❌ Not valid: payment rejected by the organizer" : "🕐 Not confirmed yet"}
          </div>
          {!confirmed && !rejected && <div className="mt-1 text-xs">{event.organizerName} hasn&apos;t confirmed this payment yet. This page updates by itself.</div>}
        </div>

        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col items-center gap-1 border-t border-dashed border-slate-200 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code that opens this receipt" className="h-40 w-40" />
          <p className="text-center text-xs text-slate-500">Show this at the event. Scanning it shows whether the payment is confirmed right now.</p>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <PrintButton>Save as PDF / print</PrintButton>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`My receipt for ${event.name}: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-whatsapp"
        >
          Share on WhatsApp
        </a>
        <Link href={`/i/${event.inviteCode}`} className="btn-secondary">
          Back to the event
        </Link>
      </div>
      <p className="text-center text-xs text-slate-400">Hisaab never holds money. {event.organizerName} received this payment directly by UPI.</p>
    </main>
  );
}
