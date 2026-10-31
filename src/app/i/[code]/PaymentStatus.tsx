import type { Contribution } from "@prisma/client";
import Link from "next/link";
import { inr, shortDate } from "@/lib/format";
import type { Check, CheckId } from "@/lib/verify/rules";

// Written for the contributor. The organizer's labels ("Amount matches what they
// entered") read like a pass when listed as a reason, and some details name other
// people ("Same image as Kiran's proof"), so they aren't shown here.
const REASONS: Record<CheckId, string> = {
  is_payment: "the screenshot doesn't look like a payment confirmation",
  readable: "the screenshot is hard to read",
  status_success: "the screenshot doesn't show a successful payment",
  amount_matches: "the amount on the screenshot is different from the amount you entered",
  amount_minimum: "the amount is less than the per-head contribution",
  payee_matches: "we couldn't confirm it was paid to the organizer's UPI ID",
  time_window: "the payment time on the screenshot is outside this collection",
  utr_format: "the UPI transaction ID isn't visible",
  utr_matches_entered: "the transaction ID you typed doesn't match the screenshot",
  utr_unique: "this transaction ID was already used for another registration",
  image_unique: "this screenshot was already used for another registration",
};

function reasons(c: Contribution): string[] {
  const checks = (c.checks as Check[] | null) ?? [];
  if (checks.length) return checks.filter((ch) => !ch.pass).map((ch) => REASONS[ch.id]);
  return [c.proofKey ? "we couldn't read the screenshot" : "no screenshot was attached"];
}

export function PaymentStatus({ contribution: c, organizerName }: { contribution: Contribution; organizerName: string }) {
  const s = c.verificationStatus;
  const confirmed = s === "VERIFIED" || s === "APPROVED";
  const rejected = s === "REJECTED";
  const why = !confirmed && !rejected ? reasons(c) : [];

  return (
    <section className="card space-y-3">
      <div className={`rounded-2xl p-5 text-center ${confirmed ? "bg-emerald-50" : rejected ? "bg-rose-50" : "bg-amber-50"}`} role="status">
        <div className="text-3xl">{confirmed ? "✅" : rejected ? "❌" : "🕐"}</div>
        <h2 className="mt-2 font-semibold">
          {s === "VERIFIED"
            ? "Payment verified. Thank you!"
            : s === "APPROVED"
              ? `${organizerName} confirmed your payment. Thank you!`
              : rejected
                ? `${organizerName} couldn't confirm this payment.`
                : "Registered! The organizer will confirm your payment."}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {c.name} · {inr(c.amount)} · registered {shortDate(c.createdAt)}
        </p>
        {why.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            We couldn&apos;t verify it automatically: {why.join("; ")}. No action needed unless you entered something wrong. This page updates once the
            organizer confirms.
          </p>
        )}
        {rejected && (
          <p className="mt-2 text-sm text-rose-800">If you did pay, message {organizerName} with your UPI transaction ID, or register the payment again.</p>
        )}
      </div>
      <p className="text-center text-sm">
        <Link href="?new=1" className="text-brand-700 underline">
          {rejected ? "Register the payment again" : "Paying for someone else too? Register another payment"}
        </Link>
      </p>
    </section>
  );
}
