import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyButton } from "@/components/forms";
import { Logo } from "@/components/ui";
import { prisma } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { buildUpiLink } from "@/lib/upi";
import { Ledger } from "./Ledger";
import { RegisterForm } from "./RegisterForm";

export default async function InvitePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ r?: string }> }) {
  const { code } = await params;
  const { r } = await searchParams;
  const event = await prisma.event.findUnique({ where: { inviteCode: code } });
  if (!event) notFound();

  // A personal reminder link lets us greet them and match with certainty.
  const member = r ? await prisma.rosterMember.findFirst({ where: { eventId: event.id, nudgeToken: r } }) : null;
  const upi = buildUpiLink({ vpa: event.organizerUpiVpa, payeeName: event.organizerName, amount: event.perHeadAmount, note: event.name });
  const qr = await QRCode.toDataURL(upi, { margin: 1, width: 360 });
  const greetName = member && !member.displayName.startsWith("+") ? member.displayName.replace(/\s*\(.*\)$/, "") : undefined;

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <Logo />
      <section className="card">
        <p className="text-sm text-slate-500">{greetName ? `Hi ${greetName}! ` : ""}You&apos;re invited to contribute to</p>
        <h1 className="text-xl font-semibold">{event.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {shortDate(event.date)} · organized by {event.organizerName}
          {event.dueDate && ` · pay by ${shortDate(event.dueDate)}`}
        </p>
      </section>

      {event.status === "CLOSED" ? (
        <section className="card text-center text-slate-600">This collection is closed. Contact {event.organizerName} if you still want to contribute.</section>
      ) : (
        <>
          <section className="card">
            <h2 className="font-semibold">1. Pay {inr(event.perHeadAmount)} by UPI</h2>
            <div className="mt-3 flex flex-col items-center gap-3">
              <a href={upi} className="btn-primary w-full py-2.5 sm:hidden">
                Pay with a UPI app
              </a>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="UPI payment QR code" className="h-48 w-48" />
              <div className="flex items-center gap-2 text-sm">
                <code className="rounded bg-slate-100 px-2 py-1">{event.organizerUpiVpa}</code>
                <CopyButton text={event.organizerUpiVpa} className="btn-ghost text-xs" />
              </div>
            </div>
          </section>
          <section className="card">
            <h2 className="mb-3 font-semibold">2. Register your payment</h2>
            <RegisterForm code={code} amount={event.perHeadAmount} nudgeToken={member ? r : undefined} defaultName={greetName} />
          </section>
        </>
      )}
      <Ledger event={event} />
      <p className="text-center text-xs text-slate-400">Hisaab never holds money. You pay the organizer directly.</p>
    </main>
  );
}
